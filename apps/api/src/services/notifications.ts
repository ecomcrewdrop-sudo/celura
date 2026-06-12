// ============================================================
//  CELURA · Service de notificaciones in-app
//  ------------------------------------------------------------
//  Una función pública: `notify(clinicId, opts)`.
//
//  Garantías:
//   • Nunca lanza al caller (fire-and-forget, igual que el mailer).
//   • Dedup automático por (clinic_id, kind, entity_type, entity_id)
//     cuando la entidad está set — evita spam si el mismo evento
//     se dispara dos veces antes de que el doctor lo lea.
//   • Respeta notification_preferences.inapp_enabled cuando hay
//     user_id; para notifs globales (user_id = null) siempre crea.
//   • Supabase Realtime publica automáticamente porque la tabla
//     está en la publication `supabase_realtime`.
//
//  Patrón de uso:
//     await notify(clinicId, {
//       kind: 'appointment_new',
//       severity: 'success',
//       title: 'Cita nueva con María García',
//       body: 'Lunes 14 jun · 4:30 pm · Limpieza',
//       icon: 'Calendar',
//       action_url: `/dashboard/appointments/${appt.id}`,
//       action_label: 'Ver cita',
//       entity_type: 'appointment',
//       entity_id: appt.id,
//     })
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'
import { trackErrorSync } from './error-tracker.js'

const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

// ── Tipos públicos ───────────────────────────────────────
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical'

export type NotificationKind =
  | 'welcome'
  | 'wa_connected'
  | 'wa_disconnected'
  | 'appointment_new'
  | 'appointment_reminder_24h'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'lead_new'
  | 'lead_high_value'
  | 'message_urgent'
  | 'trial_ending'
  | 'trial_ended'
  | 'payment_pending'
  | 'payment_received'
  | 'daily_summary'
  | 'admin_announcement'
  | 'system'
  | 'custom'

export interface NotifyOpts {
  kind: NotificationKind
  /** Tono visual. Default 'info'. */
  severity?: NotificationSeverity
  title: string
  body?: string
  /** Nombre del icono Lucide (Calendar, BellRing, AlertTriangle, etc.). */
  icon?: string
  /** Deep-link al recurso. Empieza con `/dashboard/...`. */
  action_url?: string
  action_label?: string
  /** Dirige solo a un user (si null, va a toda la clínica). */
  user_id?: string | null
  /** Para dedup + tracking. */
  entity_type?: string
  entity_id?: string
  /** Metadata libre — útil para previews ricos en el front. */
  metadata?: Record<string, unknown>
  /** Auto-expira (ej. admin announcements). ISO string. */
  expires_at?: string | null
}

export interface NotifyResult {
  status: 'created' | 'skipped' | 'deduped' | 'failed'
  id?: string
  reason?: string
}

// ──────────────────────────────────────────────────────────
//  notify() — el único punto de entrada
// ──────────────────────────────────────────────────────────
export async function notify(
  clinicId: string,
  opts: NotifyOpts,
): Promise<NotifyResult> {
  try {
    if (!clinicId || typeof clinicId !== 'string') {
      return { status: 'failed', reason: 'clinic_id inválido' }
    }

    // ── 1. Preferencias del usuario (si va dirigido a uno) ──
    if (opts.user_id) {
      const enabled = await isInAppEnabledForUser(opts.user_id, opts.kind)
      if (!enabled) {
        return { status: 'skipped', reason: 'preferencia in-app off' }
      }
    }

    // ── 2. Dedup por entidad ──
    // Si la misma entidad ya tiene una notif del mismo kind sin leer,
    // no creamos otra. Patch: refrescamos el `created_at` para que
    // suba a la parte de arriba del feed.
    if (opts.entity_type && opts.entity_id) {
      const { data: existing } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('kind', opts.kind)
        .eq('entity_type', opts.entity_type)
        .eq('entity_id', opts.entity_id)
        .is('read_at', null)
        .is('archived_at', null)
        .limit(1)
        .maybeSingle()

      if (existing?.id) {
        // Bump created_at para que vuelva al tope; mantiene un solo registro
        await supabaseAdmin
          .from('notifications')
          .update({
            created_at: new Date().toISOString(),
            title: opts.title, // refresca por si cambió (ej. otro paciente)
            body: opts.body ?? null,
            metadata: opts.metadata ?? {},
          })
          .eq('id', existing.id)
        return { status: 'deduped', id: existing.id }
      }
    }

    // ── 3. Insertar ──
    const { data: created, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        clinic_id: clinicId,
        user_id: opts.user_id ?? null,
        kind: opts.kind,
        severity: opts.severity ?? 'info',
        title: opts.title,
        body: opts.body ?? null,
        icon: opts.icon ?? null,
        action_url: opts.action_url ?? null,
        action_label: opts.action_label ?? null,
        entity_type: opts.entity_type ?? null,
        entity_id: opts.entity_id ?? null,
        metadata: opts.metadata ?? {},
        expires_at: opts.expires_at ?? null,
      })
      .select('id')
      .single()

    if (error) {
      console.warn('[Notify] insert falló:', error.message)
      trackErrorSync({
        source: 'system',
        code: 'NOTIFY_INSERT',
        error: error.message,
        clinicId,
        context: { kind: opts.kind },
      })
      return { status: 'failed', reason: error.message }
    }

    return { status: 'created', id: created!.id }
  } catch (err) {
    const message = (err as Error).message
    console.warn('[Notify] excepción:', message)
    trackErrorSync({
      source: 'system',
      code: 'NOTIFY_EXCEPTION',
      error: err,
      clinicId,
      context: { kind: opts.kind },
    })
    return { status: 'failed', reason: message }
  }
}

// ──────────────────────────────────────────────────────────
//  Helpers de preferencias
// ──────────────────────────────────────────────────────────

/**
 * Lee `notification_preferences` y aplica defaults sensatos:
 *  - Defaults: in-app on para TODO.
 *  - Excepciones: ninguna por ahora; el doctor puede apagar lo que quiera.
 */
export async function isInAppEnabledForUser(
  userId: string,
  kind: NotificationKind,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('notification_preferences')
    .select('inapp_enabled')
    .eq('user_id', userId)
    .eq('kind', kind)
    .maybeSingle<{ inapp_enabled: boolean }>()
  return data?.inapp_enabled ?? true
}

export async function isEmailEnabledForUser(
  userId: string,
  kind: NotificationKind,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('notification_preferences')
    .select('email_enabled')
    .eq('user_id', userId)
    .eq('kind', kind)
    .maybeSingle<{ email_enabled: boolean }>()
  // Defaults email-on, excepto algunos casos ruidosos:
  if (data) return data.email_enabled
  if (kind === 'message_urgent' || kind === 'lead_high_value') return false
  return true
}

// ──────────────────────────────────────────────────────────
//  Helper compartido — owner email + user_id de una clínica
//  (lo necesitan los workers para emails proactivos)
// ──────────────────────────────────────────────────────────
export interface ClinicOwnerContact {
  clinic_id: string
  clinic_name: string
  owner_id: string
  owner_email: string | null
  owner_name: string | null
  timezone: string
  trial_ends_at: string | null
  is_beta: boolean | null
  plan: string | null
  status: string | null
}

export async function getClinicOwnerContact(
  clinicId: string,
): Promise<ClinicOwnerContact | null> {
  // 1) Clinic con owner_id
  const { data: clinic, error: clinicErr } = await supabaseAdmin
    .from('clinics')
    .select('id, name, owner_id, timezone, trial_ends_at, plan, status')
    .eq('id', clinicId)
    .maybeSingle<{
      id: string
      name: string
      owner_id: string
      timezone: string
      trial_ends_at: string | null
      plan: string | null
      status: string | null
    }>()

  if (clinicErr || !clinic) return null

  // 2) is_beta vive en clinic_config (en algunas instalaciones)
  // — lo tomamos optimista, si no existe queda null.
  let is_beta: boolean | null = null
  const { data: cfg } = await supabaseAdmin
    .from('clinic_config')
    .select('is_beta')
    .eq('clinic_id', clinicId)
    .maybeSingle<{ is_beta: boolean | null }>()
  if (cfg) is_beta = cfg.is_beta

  // 3) Email del owner desde auth.users (service_role)
  let owner_email: string | null = null
  let owner_name: string | null = null
  try {
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(
      clinic.owner_id,
    )
    owner_email = user?.user?.email ?? null
    owner_name =
      (user?.user?.user_metadata?.['full_name'] as string | undefined) ??
      (user?.user?.user_metadata?.['name'] as string | undefined) ??
      null
  } catch {
    // Si falla, devolvemos null — el caller decide qué hacer
  }

  return {
    clinic_id: clinic.id,
    clinic_name: clinic.name,
    owner_id: clinic.owner_id,
    owner_email,
    owner_name,
    timezone: clinic.timezone || 'America/Mexico_City',
    trial_ends_at: clinic.trial_ends_at,
    is_beta,
    plan: clinic.plan,
    status: clinic.status,
  }
}
