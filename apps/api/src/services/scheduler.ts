// ============================================================
//  CELURA · Scheduler de seguimientos con BullMQ + Redis
//  Todos los jobs están namespaceados por clinic_id.
// ============================================================

import { Queue, Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { createClient } from '@supabase/supabase-js'
import { sendMessageWithRetry } from './whatsapp.js'
import { decrypt } from './crypto.js'
import Anthropic from '@anthropic-ai/sdk'
import type { Lead, ClinicConfig, FollowUp, FollowUpConfig } from '../types/tenant.js'
import { DEFAULT_FOLLOWUP_CONFIG } from '../types/tenant.js'

// ── Redis connection (Upstash o local) ──
const redis = new IORedis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,  // requerido por BullMQ
  enableReadyCheck: false,
  // Reintentos con backoff exponencial topado: nunca abandona, no satura.
  retryStrategy: (times) => Math.min(times * 200, 5_000),
  reconnectOnError: () => true,
})

// Throttle de logs: si Redis está caído, no inundar la consola.
let lastRedisErrAt = 0
redis.on('error', (err) => {
  const now = Date.now()
  if (now - lastRedisErrAt > 30_000) {
    lastRedisErrAt = now
    console.error('[Scheduler] Redis no disponible:', err.message)
  }
})
redis.on('ready', () => console.log('[Scheduler] Redis conectado'))

const supabaseAdmin = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { persistSession: false } }
)

// Cola única para todos los seguimientos
// El clinic_id va en el payload del job, no en el nombre de la cola
const followUpQueue = new Queue('celura-followups', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,  // mantener últimos 100 completados
    removeOnFail: 500,      // mantener últimos 500 fallidos para debug
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
})

// ── Resuelve la config de seguimientos con defaults seguros ──
//    El JSONB puede llegar incompleto (clínicas viejas, doctor que
//    todavía no abrió Settings → Seguimientos). Mergeamos contra los
//    defaults para no devolver `undefined` en campos críticos.
function resolveFollowupConfig(config: ClinicConfig): FollowUpConfig {
  const raw = (config.followup_config ?? {}) as Partial<FollowUpConfig>
  return {
    appointment_reminders: { ...DEFAULT_FOLLOWUP_CONFIG.appointment_reminders, ...raw.appointment_reminders },
    cold_followups: { ...DEFAULT_FOLLOWUP_CONFIG.cold_followups, ...raw.cold_followups },
    reactivation: { ...DEFAULT_FOLLOWUP_CONFIG.reactivation, ...raw.reactivation },
    ai_generated: raw.ai_generated ?? DEFAULT_FOLLOWUP_CONFIG.ai_generated,
    quiet_hours: { ...DEFAULT_FOLLOWUP_CONFIG.quiet_hours, ...raw.quiet_hours },
    templates: { ...DEFAULT_FOLLOWUP_CONFIG.templates, ...raw.templates },
  }
}

// ── Quiet hours: corre la entrega al próximo slot permitido ──
//    Si el job cae dentro de la ventana silenciosa (típicamente 21:00-08:00),
//    devolvemos el delay ajustado al primer minuto fuera. NO bloquea: solo
//    desplaza para no molestar al paciente.
//
//    `from`/`to` están en TZ de la clínica. Pasamos también el TZ para que
//    el cálculo se haga sin asumir UTC del server.
function applyQuietHours(
  baseDelayMs: number,
  quiet: FollowUpConfig['quiet_hours'],
  timezone: string,
): number {
  if (!quiet.enabled) return baseDelayMs
  const target = new Date(Date.now() + baseDelayMs)

  const hhmmInTz = (d: Date): { h: number; m: number; minutes: number } => {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d)
      const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
      const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
      return { h, m, minutes: h * 60 + m }
    } catch {
      return { h: d.getHours(), m: d.getMinutes(), minutes: d.getHours() * 60 + d.getMinutes() }
    }
  }

  const parseHHMM = (s: string): number => {
    const parts = s.split(':').map((n) => parseInt(n, 10))
    const h = parts[0] ?? 0
    const m = parts[1] ?? 0
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
  }

  const fromMin = parseHHMM(quiet.from)
  const toMin = parseHHMM(quiet.to)
  const targetMin = hhmmInTz(target).minutes

  const inWindow =
    fromMin <= toMin
      ? targetMin >= fromMin && targetMin < toMin
      : targetMin >= fromMin || targetMin < toMin   // cruza medianoche

  if (!inWindow) return baseDelayMs

  // Minutos hasta `to`. Si el rango cruza medianoche y target está después de `from`,
  // sumamos las horas restantes del día + `to`.
  let minutesToWait: number
  if (fromMin <= toMin) {
    minutesToWait = toMin - targetMin
  } else if (targetMin >= fromMin) {
    minutesToWait = 24 * 60 - targetMin + toMin
  } else {
    minutesToWait = toMin - targetMin
  }
  return baseDelayMs + minutesToWait * 60_000
}

// ── Genera el mensaje de seguimiento con IA ──
async function generateFollowUpMessage(
  config: ClinicConfig,
  lead: Lead,
  type: FollowUp['type']
): Promise<string> {
  const fu = resolveFollowupConfig(config)
  const template = fu.templates[type as keyof FollowUpConfig['templates']]?.trim() ?? ''

  // Modo plantilla fija: si el doctor desactivó IA o si el tipo tiene un
  // template con variables {{...}}, lo enviamos tal cual con substitución.
  if (!fu.ai_generated && template) {
    return template
      .replace(/\{\{\s*name\s*\}\}/g, lead.name ?? '')
      .replace(/\{\{\s*assistant\s*\}\}/g, config.assistant_name)
      .replace(/\{\{\s*clinic\s*\}\}/g, 'la clínica')
  }

  if (!config.claude_key_enc) {
    // Fallback sin IA si no hay key configurada
    return template || getFallbackMessage(config, lead, type)
  }

  const claudeKey = decrypt(config.claude_key_enc)
  const anthropic = new Anthropic({ apiKey: claudeKey })

  const prompts: Record<FollowUp['type'], string> = {
    pre_appt_24h: `Escribe un mensaje de WhatsApp recordando a ${lead.name ?? 'el paciente'} que tiene cita mañana en la clínica. Tono: ${config.tone}. Máximo 2 líneas. Incluye que puede confirmar o reprogramar si necesita.`,
    pre_appt_2h:  `Escribe un mensaje de WhatsApp recordando a ${lead.name ?? 'el paciente'} que tiene cita en 2 horas. Tono: ${config.tone}. Máximo 1 línea. Incluye la dirección si la tienes.`,
    post_appt_1h: `Escribe un mensaje de WhatsApp preguntando cómo le fue a ${lead.name ?? 'el paciente'} en su visita de hoy. Tono: ${config.tone}. Cálido, breve. Sin pedir reseña todavía.`,
    post_appt_review: `Escribe un mensaje de WhatsApp pidiendo una reseña de Google a ${lead.name ?? 'el paciente'} después de su visita. Tono: ${config.tone}. Natural, no forzado. 2 líneas máximo.`,
    cold_7d:      `Escribe un mensaje de WhatsApp para retomar contacto con ${lead.name ?? 'alguien'} que preguntó por ${lead.treatment_interest ?? 'un tratamiento'} hace una semana y no respondió. Tono: ${config.tone}. Sin presión. Curioso, no insistente.`,
    cold_14d:     `Escribe un mensaje de WhatsApp para retomar contacto con ${lead.name ?? 'alguien'} que consultó hace dos semanas. Diferente al mensaje anterior. Tono: ${config.tone}. Ofrecer algo de valor (consejo, info).`,
    cold_30d:     `Escribe un mensaje de WhatsApp de reactivación final para ${lead.name ?? 'alguien'} que consultó hace un mes. Último intento. Tono: ${config.tone}. Genuino, no desesperado.`,
    reactivation: `Escribe un mensaje de WhatsApp para un paciente que no ha venido en más de 3 meses. Nombre: ${lead.name ?? 'el paciente'}. Tono: ${config.tone}. Recordarle que lo extrañamos. 2 líneas.`,
    custom:       `Escribe un mensaje de seguimiento para ${lead.name ?? 'el paciente'}. Tono: ${config.tone}. Breve y útil.`,
  }

  // Si hay template del doctor, lo inyectamos como guía/voz dentro del prompt.
  const promptWithTemplate = template
    ? `${prompts[type]}\n\nUsa esta línea como guía de voz / contenido (puedes ajustarla pero respeta el espíritu):\n"${template}"`
    : prompts[type]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: `Eres ${config.assistant_name}, asistente de una clínica dental. Escribes mensajes de WhatsApp cortos, cálidos y humanos. NUNCA menciones que eres IA.`,
    messages: [{ role: 'user', content: promptWithTemplate }],
  })

  return response.content
    .filter(b => b.type === 'text')
    .map(b => b.type === 'text' ? b.text : '')
    .join('')
}

// ── Mensajes de fallback sin IA ──
function getFallbackMessage(config: ClinicConfig, lead: Lead, type: FollowUp['type']): string {
  const n = lead.name ?? 'Hola'
  const a = config.assistant_name
  const messages: Record<FollowUp['type'], string> = {
    pre_appt_24h:     `${n}, te recuerdo que mañana tienes cita con nosotros. Si necesitas reprogramar, aquí estamos. — ${a}`,
    pre_appt_2h:      `${n}, tu cita es en 2 horas. ¡Te esperamos! — ${a}`,
    post_appt_1h:     `${n}, esperamos que te hayas sentido bien atendido hoy. Cualquier duda, aquí estamos. — ${a}`,
    post_appt_review: `${n}, si quieres dejarnos una reseña en Google, nos ayudaría muchísimo. ¡Gracias por tu confianza! — ${a}`,
    cold_7d:          `${n}, hace unos días preguntaste por nosotros. ¿Pudiste resolver tu duda? — ${a}`,
    cold_14d:         `${n}, queríamos saber si aún necesitas ayuda con tu sonrisa. Aquí seguimos. — ${a}`,
    cold_30d:         `${n}, última vez por si te interesa retomar. Estaremos encantados de atenderte. — ${a}`,
    reactivation:     `${n}, hace tiempo no sabemos de ti. ¿Cómo estás? Si necesitas algo, aquí estamos. — ${a}`,
    custom:           `${n}, queríamos estar en contacto. ¿Podemos ayudarte en algo? — ${a}`,
  }
  return messages[type]
}

// ── Encola un seguimiento ──
export async function enqueueFollowUp(
  clinicId: string,
  leadId: string,
  type: FollowUp['type'],
  delayMs: number,
  appointmentId?: string
): Promise<string | null> {
  try {
    // BullMQ no acepta ":" en jobId. Usamos "_" como separador.
    const jobId = `${clinicId}_${leadId}_${type}_${Date.now()}`

    const job = await followUpQueue.add(
      type,
      { clinic_id: clinicId, lead_id: leadId, type, appointment_id: appointmentId ?? null },
      {
        jobId,
        delay: delayMs,
      }
    )

    // Registrar en DB para poder cancelarlo si el lead agenda
    await supabaseAdmin.from('follow_ups').insert({
      clinic_id: clinicId,
      lead_id: leadId,
      appointment_id: appointmentId ?? null,
      type,
      scheduled_at: new Date(Date.now() + delayMs).toISOString(),
      status: 'pending',
      bull_job_id: job.id,
    })

    return job.id ?? null
  } catch (err) {
    console.error(`[Scheduler] Error encolando ${type} para lead ${leadId}:`, err)
    return null
  }
}

// ── Cancela todos los seguimientos pendientes de un lead ──
// (cuando el lead agenda cita, cancelar los cold follow-ups)
export async function cancelLeadFollowUps(
  clinicId: string,
  leadId: string,
  types?: FollowUp['type'][]
): Promise<void> {
  const query = supabaseAdmin
    .from('follow_ups')
    .select('bull_job_id, type')
    .eq('clinic_id', clinicId)
    .eq('lead_id', leadId)
    .eq('status', 'pending')

  if (types?.length) {
    query.in('type', types)
  }

  const { data: pendingJobs } = await query

  if (!pendingJobs?.length) return

  for (const row of pendingJobs) {
    if (row.bull_job_id) {
      const job = await followUpQueue.getJob(row.bull_job_id)
      if (job) await job.remove()
    }
  }

  // Marcar como cancelados en DB
  const ids = pendingJobs.map(r => r.bull_job_id).filter(Boolean)
  if (ids.length) {
    await supabaseAdmin
      .from('follow_ups')
      .update({ status: 'cancelled' })
      .eq('clinic_id', clinicId)
      .eq('lead_id', leadId)
      .in('bull_job_id', ids)
  }
}

// ── Cancela todos los seguimientos asociados a una cita ──
// (cuando una cita se cancela o reagenda)
export async function cancelAppointmentFollowUps(
  clinicId: string,
  appointmentId: string,
): Promise<void> {
  const { data: pending } = await supabaseAdmin
    .from('follow_ups')
    .select('bull_job_id')
    .eq('clinic_id', clinicId)
    .eq('appointment_id', appointmentId)
    .eq('status', 'pending')

  if (!pending?.length) return

  for (const row of pending) {
    if (row.bull_job_id) {
      const job = await followUpQueue.getJob(row.bull_job_id)
      if (job) await job.remove()
    }
  }

  await supabaseAdmin
    .from('follow_ups')
    .update({ status: 'cancelled' })
    .eq('clinic_id', clinicId)
    .eq('appointment_id', appointmentId)
    .eq('status', 'pending')
}

// Carga la config y timezone para una clínica en un solo round-trip.
async function loadClinicCtx(clinicId: string): Promise<{
  fu: FollowUpConfig
  timezone: string
} | null> {
  const [{ data: cfg }, { data: clinicRow }] = await Promise.all([
    supabaseAdmin
      .from('clinic_config')
      .select('followup_config')
      .eq('clinic_id', clinicId)
      .single<{ followup_config: FollowUpConfig | null }>(),
    supabaseAdmin
      .from('clinics')
      .select('timezone')
      .eq('id', clinicId)
      .single<{ timezone: string | null }>(),
  ])
  if (!cfg) return null
  const fu = resolveFollowupConfig({ followup_config: cfg.followup_config } as ClinicConfig)
  return { fu, timezone: clinicRow?.timezone || 'America/Mexico_City' }
}

// ── Programa los seguimientos apropiados según el contexto ──
export async function scheduleFollowUps(
  clinicId: string,
  leadId: string,
  intent: string,
  isFirstMessage: boolean
): Promise<void> {
  const MS = { day: 86_400_000 }
  const ctx = await loadClinicCtx(clinicId)
  if (!ctx) return
  const { fu, timezone } = ctx
  const cold = fu.cold_followups
  const shift = (ms: number) => applyQuietHours(ms, fu.quiet_hours, timezone)

  if (isFirstMessage) {
    if (cold.d7_enabled) {
      await enqueueFollowUp(clinicId, leadId, 'cold_7d', shift(cold.d7_days * MS.day))
    }
    if (cold.d14_enabled) {
      await enqueueFollowUp(clinicId, leadId, 'cold_14d', shift(cold.d14_days * MS.day))
    }
    if (cold.d30_enabled) {
      await enqueueFollowUp(clinicId, leadId, 'cold_30d', shift(cold.d30_days * MS.day))
    }
  }

  if (intent === 'schedule') {
    await cancelLeadFollowUps(clinicId, leadId, ['cold_7d', 'cold_14d', 'cold_30d'])
  }
}

// ── Programa recordatorios para una cita específica ──
export async function scheduleAppointmentReminders(
  clinicId: string,
  leadId: string,
  appointmentId: string,
  appointmentDate: Date
): Promise<void> {
  const ctx = await loadClinicCtx(clinicId)
  if (!ctx) return
  const { fu, timezone } = ctx
  const ar = fu.appointment_reminders
  const shift = (ms: number) => applyQuietHours(ms, fu.quiet_hours, timezone)

  const now = Date.now()
  const apptTime = appointmentDate.getTime()
  const h24 = apptTime - 24 * 3_600_000
  const hN  = apptTime - ar.h2_minutes_before * 60_000
  const postVisit = apptTime + ar.post_visit_minutes_after * 60_000
  const reviewReq = postVisit + ar.review_request_hours_after * 3_600_000

  if (ar.h24_enabled && h24 > now) {
    await enqueueFollowUp(clinicId, leadId, 'pre_appt_24h', shift(h24 - now), appointmentId)
  }
  if (ar.h2_enabled && hN > now) {
    await enqueueFollowUp(clinicId, leadId, 'pre_appt_2h', shift(hN - now), appointmentId)
  }
  if (ar.post_visit_enabled && postVisit > now) {
    await enqueueFollowUp(clinicId, leadId, 'post_appt_1h', shift(postVisit - now), appointmentId)
  }
  if (ar.review_request_enabled && reviewReq > now) {
    await enqueueFollowUp(clinicId, leadId, 'post_appt_review', shift(reviewReq - now), appointmentId)
  }

  // Cancelar cold follow-ups porque el lead agendó
  await cancelLeadFollowUps(clinicId, leadId, ['cold_7d', 'cold_14d', 'cold_30d', 'reactivation'])
}

// Referencia al worker activo (para poder cerrarlo en el shutdown)
let followUpWorker: Worker | null = null

// ── Worker: procesa los jobs de la cola ──
export function startFollowUpWorker(): void {
  if (followUpWorker) return  // idempotente: no crear dos workers
  const worker = new Worker<{
    clinic_id: string
    lead_id: string
    type: FollowUp['type']
    appointment_id: string | null
  }>(
    'celura-followups',
    async (job: Job) => {
      const { clinic_id, lead_id, type } = job.data

      // Cargar datos necesarios
      const [{ data: config }, { data: lead }] = await Promise.all([
        supabaseAdmin.from('clinic_config').select('*').eq('clinic_id', clinic_id).single<ClinicConfig>(),
        supabaseAdmin.from('leads').select('*').eq('id', lead_id).single<Lead>(),
      ])

      if (!config || !lead) {
        throw new Error(`Config o lead no encontrado para clinic ${clinic_id}`)
      }

      // Generar mensaje con IA
      const message = await generateFollowUpMessage(config, lead, type)

      // Enviar por WhatsApp
      const sent = await sendMessageWithRetry(clinic_id, lead.phone, message)

      if (!sent) throw new Error(`No se pudo enviar mensaje a ${lead.phone}`)

      // Marcar como enviado en DB
      await supabaseAdmin
        .from('follow_ups')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          message_preview: message,
        })
        .eq('bull_job_id', job.id)

      console.log(`[Scheduler] ✓ ${type} enviado a ${lead.phone} (clinic ${clinic_id})`)
    },
    {
      connection: redis,
      concurrency: 5,  // máximo 5 jobs paralelos
    }
  )

  worker.on('failed', async (job, err) => {
    console.error(`[Scheduler] ✗ Job ${job?.id} falló:`, err.message)
    if (job?.id) {
      await supabaseAdmin
        .from('follow_ups')
        .update({ status: 'failed', error_msg: err.message })
        .eq('bull_job_id', job.id)
    }
  })

  followUpWorker = worker
  console.log('[Scheduler] Worker de seguimientos activo')
}

// ── Cierre ordenado: liberar worker, cola y conexión Redis ──
export async function shutdownScheduler(): Promise<void> {
  try {
    if (followUpWorker) {
      await followUpWorker.close()
      followUpWorker = null
    }
    await followUpQueue.close()
    await redis.quit()
  } catch (err) {
    console.error('[Scheduler] Error cerrando el scheduler:', err)
  }
}
