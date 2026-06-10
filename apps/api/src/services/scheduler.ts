// ============================================================
//  CELURA · Scheduler de seguimientos con BullMQ + Redis
//  Todos los jobs están namespaceados por clinic_id.
// ============================================================

import { Queue, Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { createClient } from '@supabase/supabase-js'
import { sendMessage } from './whatsapp.js'
import { decrypt } from './crypto.js'
import Anthropic from '@anthropic-ai/sdk'
import type { Lead, ClinicConfig, FollowUp } from '../types/tenant.js'

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

// ── Genera el mensaje de seguimiento con IA ──
async function generateFollowUpMessage(
  config: ClinicConfig,
  lead: Lead,
  type: FollowUp['type']
): Promise<string> {
  if (!config.claude_key_enc) {
    // Fallback sin IA si no hay key configurada
    return getFallbackMessage(config, lead, type)
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

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: `Eres ${config.assistant_name}, asistente de una clínica dental. Escribes mensajes de WhatsApp cortos, cálidos y humanos. NUNCA menciones que eres IA.`,
    messages: [{ role: 'user', content: prompts[type] }],
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
    const jobId = `${clinicId}:${leadId}:${type}:${Date.now()}`

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

// ── Programa los seguimientos apropiados según el contexto ──
export async function scheduleFollowUps(
  clinicId: string,
  leadId: string,
  intent: string,
  isFirstMessage: boolean
): Promise<void> {
  const MS = {
    min: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
  }

  // Si el lead acaba de llegar y no respondió en 24h → cold follow-up
  if (isFirstMessage) {
    await enqueueFollowUp(clinicId, leadId, 'cold_7d', 7 * MS.day)
    await enqueueFollowUp(clinicId, leadId, 'cold_14d', 14 * MS.day)
    await enqueueFollowUp(clinicId, leadId, 'cold_30d', 30 * MS.day)
  }

  // Si mostró intención de agendar → cancelar cold, esperar confirmación
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
  const now = Date.now()
  const apptTime = appointmentDate.getTime()

  const h24 = apptTime - 24 * 3_600_000
  const h2  = apptTime - 2 * 3_600_000
  const post = apptTime + 1 * 3_600_000

  // Solo encolar si el tiempo futuro es en el futuro
  if (h24 > now) {
    await enqueueFollowUp(clinicId, leadId, 'pre_appt_24h', h24 - now, appointmentId)
  }
  if (h2 > now) {
    await enqueueFollowUp(clinicId, leadId, 'pre_appt_2h', h2 - now, appointmentId)
  }
  await enqueueFollowUp(clinicId, leadId, 'post_appt_1h', post - now, appointmentId)
  await enqueueFollowUp(clinicId, leadId, 'post_appt_review', (post + 24 * 3_600_000) - now, appointmentId)

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
      const sent = await sendMessage(clinic_id, lead.phone, message)

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
