// ============================================================
//  CELURA · Tipos compartidos del módulo de emails
// ============================================================

/**
 * Identificador del tipo de email — debe coincidir 1:1 con el
 * CHECK constraint de email_log.kind en la migración 008.
 */
export type EmailKind =
  | 'welcome'
  | 'trial_ending'
  | 'trial_ended'
  | 'payment_pending'
  | 'payment_received'
  | 'appointment_confirmation'
  | 'appointment_reminder_24h'
  | 'wa_connected'
  | 'wa_disconnected'
  | 'daily_summary'
  | 'admin_alert'
  | 'test'
  | 'custom'

/**
 * Resultado de renderear una plantilla.
 * Devolvemos HTML + texto plano (fallback para clientes que no
 * renderean HTML o filtran imágenes / CSS).
 */
export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/**
 * Argumentos comunes que recibe el layout base.
 */
export interface LayoutOptions {
  /** Pre-header oculto (snippet del inbox). */
  preheader?: string
  /** Color del acento del email — default lime Celura. */
  accent?: string
  /** Si es false, no muestra el footer corporativo. */
  showFooter?: boolean
  /** Texto adicional al pie ("Recibes esto porque..."). */
  footerNote?: string
}

/**
 * Datos minimos de la clínica que las plantillas necesitan.
 */
export interface ClinicSummary {
  id: string
  name: string
  slug?: string | null
  plan?: string | null
  status?: string | null
  trial_ends_at?: string | null
  is_beta?: boolean | null
}

/**
 * Resultado del envío: el mailer nunca lanza al caller.
 */
export interface SendResult {
  id: string             // id de email_log
  status: 'sent' | 'failed' | 'skipped'
  provider_id?: string | null
  error?: string | null
}
