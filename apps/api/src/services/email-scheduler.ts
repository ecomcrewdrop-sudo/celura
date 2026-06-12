// ============================================================
//  CELURA · Email scheduler (cola BullMQ paralela a follow-ups)
//  ------------------------------------------------------------
//  Cola única: `celura-emails`. Jobs:
//
//   • appointment-reminder-24h  (delayed, one-shot)
//       payload: { clinic_id, appointment_id }
//       delay:   `scheduledAt - 24h - now`
//
//   • trial-check               (repeatable, diario 09:00 UTC)
//       payload: {}
//       acción:  escanea clinics con trial activo y dispara
//                emails T-3 / T-1 / T-0 con dedup por email_log.
//
//   • daily-summary             (repeatable, cada 15 min)
//       payload: {}
//       acción:  por cada clínica, si en su timezone son las
//                7:00 am (ventana de 15 min), agrega los stats
//                de ayer y dispara el digest.
//                Idempotencia: revisa email_log (dedup 22h).
//
//  El worker procesa todos los kinds; cada uno tiene su handler.
// ============================================================

import { Queue, Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'
import {
  sendAppointmentReminder24hEmail,
  sendTrialEndingEmail,
  sendDailySummaryEmail,
} from './email/index.js'
import {
  getClinicOwnerContact,
  notify,
  isEmailEnabledForUser,
} from './notifications.js'
import { trackErrorSync } from './error-tracker.js'

// ── Constantes ────────────────────────────────────────────
const QUEUE_NAME = 'celura-emails'
const APPOINTMENT_REMINDER_HOURS_BEFORE = 24
const DEDUP_WINDOW_HOURS = 22

// ── Redis ─────────────────────────────────────────────────
const redis = new IORedis(
  process.env['REDIS_URL'] ?? 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  },
)

let lastErrAt = 0
redis.on('error', (err) => {
  const now = Date.now()
  if (now - lastErrAt > 30_000) {
    lastErrAt = now
    console.error('[EmailScheduler] Redis error:', err.message)
  }
})

// ── Supabase service-role ─────────────────────────────────
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ── Cola ──────────────────────────────────────────────────
type JobName =
  | 'appointment-reminder-24h'
  | 'trial-check'
  | 'daily-summary'

interface AppointmentReminderPayload {
  clinic_id: string
  appointment_id: string
}
interface EmptyPayload {
  /* no payload */
}

const emailQueue = new Queue<
  AppointmentReminderPayload | EmptyPayload,
  unknown,
  JobName
>(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  },
})

// ──────────────────────────────────────────────────────────
//  API pública del módulo
// ──────────────────────────────────────────────────────────

/**
 * Agenda el recordatorio 24h antes de una cita. Idempotente:
 * si ya hay un job para ese appointment_id, lo reemplaza.
 */
export async function scheduleAppointmentReminder24h(
  clinicId: string,
  appointmentId: string,
  scheduledAt: Date | string,
): Promise<void> {
  try {
    const scheduledDate =
      typeof scheduledAt === 'string' ? new Date(scheduledAt) : scheduledAt
    const triggerAt =
      scheduledDate.getTime() -
      APPOINTMENT_REMINDER_HOURS_BEFORE * 3_600_000
    const delay = triggerAt - Date.now()

    // Si la cita es en menos de 24h, no agendamos: el recordatorio sería
    // pasado (o instantáneo). Esa decisión queda en manos del flujo de
    // confirmación, que ya mandó el correo "Cita confirmada".
    if (delay < 60_000) {
      return
    }

    // Idempotencia: jobId = appointment_id. Si re-agendamos, BullMQ
    // upsertea el delay.
    const jobId = `appt-reminder-${appointmentId}`
    await emailQueue.remove(jobId).catch(() => {})
    await emailQueue.add(
      'appointment-reminder-24h',
      { clinic_id: clinicId, appointment_id: appointmentId },
      { jobId, delay },
    )
  } catch (err) {
    trackErrorSync({
      source: 'system',
      code: 'EMAIL_SCHEDULER',
      error: err,
      clinicId,
      context: { op: 'scheduleAppointmentReminder24h', appointmentId },
    })
  }
}

/**
 * Cancela el recordatorio 24h (cuando la cita se cancela o se reprograma).
 */
export async function cancelAppointmentReminder24h(
  appointmentId: string,
): Promise<void> {
  try {
    await emailQueue.remove(`appt-reminder-${appointmentId}`)
  } catch {
    // ignore: job puede no existir
  }
}

/**
 * Registra los jobs repeatable. Idempotente: BullMQ usa una key
 * basada en el pattern, así que llamarlo en cada boot está OK.
 */
export async function registerRepeatableEmailJobs(): Promise<void> {
  // Trial check: diario 09:00 UTC
  await emailQueue.add(
    'trial-check',
    {},
    {
      repeat: { pattern: '0 9 * * *', tz: 'UTC' },
      jobId: 'trial-check-daily',
    },
  )

  // Daily summary scan: cada 15 min. Cada corrida decide qué clínicas
  // están justo a las 7am de su timezone y dispara.
  await emailQueue.add(
    'daily-summary',
    {},
    {
      repeat: { pattern: '*/15 * * * *', tz: 'UTC' },
      jobId: 'daily-summary-scan',
    },
  )

  console.log('[EmailScheduler] Repeatable jobs registrados')
}

// ──────────────────────────────────────────────────────────
//  Worker
// ──────────────────────────────────────────────────────────
let worker: Worker<unknown, unknown, string> | null = null

export function startEmailWorker(): void {
  if (worker) return

  const w: Worker<unknown, unknown, string> = new Worker<unknown, unknown, string>(
    QUEUE_NAME,
    async (job: Job<unknown, unknown, string>) => {
      switch (job.name as JobName) {
        case 'appointment-reminder-24h':
          return handleAppointmentReminder(
            job.data as AppointmentReminderPayload,
          )
        case 'trial-check':
          return handleTrialCheck()
        case 'daily-summary':
          return handleDailySummaryScan()
        default:
          console.warn('[EmailScheduler] Job desconocido:', job.name)
      }
    },
    { connection: redis, concurrency: 4 },
  )
  worker = w

  w.on('failed', (job, err) => {
    console.error(
      `[EmailScheduler] job ${job?.name} (${job?.id}) falló:`,
      err.message,
    )
  })

  console.log('[EmailScheduler] Worker activo')
}

export async function shutdownEmailScheduler(): Promise<void> {
  if (worker) {
    await worker.close()
    worker = null
  }
  await emailQueue.close()
}

// ──────────────────────────────────────────────────────────
//  Handlers
// ──────────────────────────────────────────────────────────

/** appointment-reminder-24h */
async function handleAppointmentReminder(
  payload: AppointmentReminderPayload,
): Promise<void> {
  const { appointment_id } = payload

  // 1) Cargar la cita + lead + clinic
  const { data: appt } = await sb
    .from('appointments')
    .select(
      `id, clinic_id, lead_id, scheduled_at, duration_min, treatment, notes, status, email_reminder_24h_sent,
       leads:lead_id ( id, name, email ),
       clinics:clinic_id ( id, name, phone, city )`,
    )
    .eq('id', appointment_id)
    .maybeSingle<{
      id: string
      clinic_id: string
      lead_id: string
      scheduled_at: string
      duration_min: number | null
      treatment: string | null
      notes: string | null
      status: string
      email_reminder_24h_sent: boolean
      leads: { id: string; name: string | null; email: string | null } | null
      clinics: {
        id: string
        name: string
        phone: string | null
        city: string | null
      } | null
    }>()

  if (!appt) return // ya borrada
  if (
    appt.status === 'cancelled' ||
    appt.status === 'rescheduled' ||
    appt.status === 'no_show'
  ) {
    return // ignorar
  }
  if (appt.email_reminder_24h_sent) return
  if (!appt.leads?.email) return

  // 2) Disparar email (fire-and-forget pero await aquí para marcar sent)
  await sendAppointmentReminder24hEmail(appt.leads.email, {
    patientName: appt.leads.name,
    clinic: {
      id: appt.clinics?.id ?? appt.clinic_id,
      name: appt.clinics?.name ?? 'Clínica',
      phone: appt.clinics?.phone ?? null,
      city: appt.clinics?.city ?? null,
    },
    scheduledAt: appt.scheduled_at,
    treatment: appt.treatment,
    durationMin: appt.duration_min,
  })

  // 3) Marcar enviado para idempotencia
  await sb
    .from('appointments')
    .update({ email_reminder_24h_sent: true })
    .eq('id', appointment_id)

  // 4) Notificar al doctor en el panel (operativo: "mañana viene X")
  await notify(appt.clinic_id, {
    kind: 'appointment_reminder_24h',
    severity: 'info',
    title: `Mañana: ${appt.leads.name ?? 'paciente'} en ${appt.treatment ?? 'consulta'}`,
    body: 'Le acabamos de enviar el recordatorio por correo.',
    icon: 'CalendarClock',
    action_url: `/dashboard/appointments/${appointment_id}`,
    action_label: 'Ver cita',
    entity_type: 'appointment',
    entity_id: appointment_id,
  })
}

/** trial-check: T-3 / T-1 / T-0 con dedup por email_log */
async function handleTrialCheck(): Promise<void> {
  const now = new Date()
  const day = 86_400_000
  // Ventanas: trial_ends_at cae mañana (T-1), pasado mañana T-3 ya no
  // funciona — mejor: window por días redondos
  const targets = [3, 1, 0]

  for (const daysOut of targets) {
    const lowerMs = now.getTime() + daysOut * day
    const upperMs = lowerMs + day - 1
    const lower = new Date(lowerMs).toISOString()
    const upper = new Date(upperMs).toISOString()

    const { data: clinics } = await sb
      .from('clinics')
      .select('id, name, owner_id, trial_ends_at, plan, status')
      .gte('trial_ends_at', lower)
      .lte('trial_ends_at', upper)
      .in('plan', ['trial'])
      .neq('status', 'cancelled')

    for (const c of clinics ?? []) {
      await sendTrialReminderForClinic(c.id).catch((err) => {
        console.warn(`[trial-check] ${c.id} falló:`, (err as Error).message)
      })
    }
  }
}

/** Envío individual con dedup en email_log (22h) */
async function sendTrialReminderForClinic(clinicId: string): Promise<void> {
  const owner = await getClinicOwnerContact(clinicId)
  if (!owner || !owner.owner_email || !owner.trial_ends_at) return

  // Dedup por email_log
  const since = new Date(
    Date.now() - DEDUP_WINDOW_HOURS * 3_600_000,
  ).toISOString()
  const { data: recent } = await sb
    .from('email_log')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('kind', 'trial_ending')
    .gte('created_at', since)
    .limit(1)

  if (recent && recent.length > 0) return

  // Respeta preferencias del owner
  const emailOn = await isEmailEnabledForUser(owner.owner_id, 'trial_ending')
  if (emailOn) {
    await sendTrialEndingEmail(owner.owner_email, {
      ownerName: owner.owner_name,
      clinic: {
        id: owner.clinic_id,
        name: owner.clinic_name,
        plan: owner.plan ?? 'trial',
        status: owner.status ?? 'trial',
        is_beta: owner.is_beta ?? false,
        trial_ends_at: owner.trial_ends_at,
      },
      trialEndsAt: owner.trial_ends_at,
      isBeta: owner.is_beta ?? false,
    })
  }

  // Notif in-app siempre
  await notify(clinicId, {
    kind: 'trial_ending',
    severity: 'warning',
    title: 'Tu prueba está por terminar',
    body: 'Activa tu plan para que tu asistente siga conectada.',
    icon: 'AlertTriangle',
    action_url: '/dashboard/billing',
    action_label: 'Activar plan',
    entity_type: 'clinic',
    entity_id: clinicId,
  })
}

/** daily-summary scan: corre cada 15 min, dispara solo a clínicas que
 *  están en su 07:00 local (±15min). */
async function handleDailySummaryScan(): Promise<void> {
  const { data: clinics } = await sb
    .from('clinics')
    .select('id, timezone')
    .neq('status', 'cancelled')

  for (const c of clinics ?? []) {
    if (!isSevenAmIn(c.timezone)) continue
    await sendDailySummaryForClinic(c.id).catch((err) => {
      console.warn(`[daily-summary] ${c.id} falló:`, (err as Error).message)
    })
  }
}

function isSevenAmIn(tz: string): boolean {
  try {
    // Intl.DateTimeFormat con la TZ → HH:mm de la clínica
    const fmt = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz || 'UTC',
    })
    const parts = fmt.formatToParts(new Date())
    const hh = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
    const mm = parseInt(
      parts.find((p) => p.type === 'minute')?.value ?? '0',
      10,
    )
    // Ventana: 07:00 → 07:14 (que el scan de cada 15 min lo agarre una vez)
    return hh === 7 && mm < 15
  } catch {
    return false
  }
}

async function sendDailySummaryForClinic(clinicId: string): Promise<void> {
  const owner = await getClinicOwnerContact(clinicId)
  if (!owner || !owner.owner_email) return

  // Dedup 22h
  const since = new Date(
    Date.now() - DEDUP_WINDOW_HOURS * 3_600_000,
  ).toISOString()
  const { data: recent } = await sb
    .from('email_log')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('kind', 'daily_summary')
    .gte('created_at', since)
    .limit(1)
  if (recent && recent.length > 0) return

  // Calcular stats de ayer en TZ local
  const stats = await computeYesterdayStats(clinicId, owner.timezone)
  const forDate = yesterdayIsoInTz(owner.timezone)

  // Respeta preferencias del owner
  const emailOn = await isEmailEnabledForUser(owner.owner_id, 'daily_summary')
  if (emailOn) {
    await sendDailySummaryEmail(owner.owner_email, {
      ownerName: owner.owner_name,
      clinic: {
        id: owner.clinic_id,
        name: owner.clinic_name,
      },
      forDate,
      stats,
      highlights: [], // futuro: cosas detectadas por IA
    })
  }

  // Notif in-app: card resumen
  await notify(clinicId, {
    kind: 'daily_summary',
    severity: 'info',
    title: `Resumen de ayer`,
    body: `${stats.newLeads} pacientes nuevos · ${stats.appointmentsScheduled} citas agendadas.`,
    icon: 'BarChart3',
    action_url: '/dashboard',
    action_label: 'Ver panel',
    entity_type: 'daily_summary',
    entity_id: undefined,
    metadata: { stats, forDate },
  })
}

interface DailyStats {
  newLeads: number
  messagesIn: number
  messagesOut: number
  appointmentsScheduled: number
  appointmentsToday: number
}

async function computeYesterdayStats(
  clinicId: string,
  tz: string,
): Promise<DailyStats> {
  const { startUtc, endUtc, todayStartUtc, todayEndUtc } = boundsForYesterdayAndTodayInTz(
    tz,
  )

  // Leads creados ayer
  const { count: newLeads } = await sb
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .gte('created_at', startUtc)
    .lt('created_at', endUtc)

  // Citas agendadas ayer (por created_at, no por scheduled_at)
  const { count: appointmentsScheduled } = await sb
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .gte('created_at', startUtc)
    .lt('created_at', endUtc)

  // Citas que ocurren hoy
  const { count: appointmentsToday } = await sb
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .gte('scheduled_at', todayStartUtc)
    .lt('scheduled_at', todayEndUtc)
    .in('status', ['scheduled', 'confirmed'])

  // Mensajes in/out ayer — tabla `messages` puede no existir o tener otro nombre.
  // Intentamos `messages` con direction in/out; si falla, dejamos 0.
  let messagesIn = 0
  let messagesOut = 0
  try {
    const inRes = await sb
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('created_at', startUtc)
      .lt('created_at', endUtc)
      .eq('direction', 'in')
    messagesIn = inRes.count ?? 0

    const outRes = await sb
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('created_at', startUtc)
      .lt('created_at', endUtc)
      .eq('direction', 'out')
    messagesOut = outRes.count ?? 0
  } catch {
    // tabla no existe — déjalo en 0
  }

  return {
    newLeads: newLeads ?? 0,
    messagesIn,
    messagesOut,
    appointmentsScheduled: appointmentsScheduled ?? 0,
    appointmentsToday: appointmentsToday ?? 0,
  }
}

/**
 * Devuelve las fronteras UTC de "ayer" y "hoy" en la TZ dada.
 * Truco: formatemos "ahora" en la TZ y restamos las horas/min.
 */
function boundsForYesterdayAndTodayInTz(tz: string) {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'

  // Fecha local en TZ
  const y = parseInt(get('year'), 10)
  const m = parseInt(get('month'), 10)
  const d = parseInt(get('day'), 10)

  // Día actual a las 00:00 hora local. Construimos pretendiendo que la
  // cadena ISO es UTC y luego restamos el offset (Intl no expone offset
  // directo; estimamos con el delta entre "now" y "now en TZ local").
  const localStartIso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00.000Z`
  const localStartAsUtc = new Date(localStartIso).getTime()
  const fakeUtcParts = fmt.formatToParts(new Date(localStartAsUtc))
  const offsetH =
    parseInt(fakeUtcParts.find((p) => p.type === 'hour')?.value ?? '0', 10) -
    0
  // Si offsetH != 0, ajustamos
  const todayStart = localStartAsUtc - offsetH * 3_600_000
  const todayEnd = todayStart + 86_400_000
  const yStart = todayStart - 86_400_000
  const yEnd = todayStart

  return {
    startUtc: new Date(yStart).toISOString(),
    endUtc: new Date(yEnd).toISOString(),
    todayStartUtc: new Date(todayStart).toISOString(),
    todayEndUtc: new Date(todayEnd).toISOString(),
  }
}

function yesterdayIsoInTz(tz: string): string {
  const { startUtc } = boundsForYesterdayAndTodayInTz(tz)
  return startUtc
}
