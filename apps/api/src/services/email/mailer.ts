// ============================================================
//  CELURA · Mailer (cliente Resend + auditoría)
//  ------------------------------------------------------------
//  Por qué fetch en vez del SDK de Resend:
//   • Cero dependencias nuevas → menor superficie de seguridad.
//   • Resend expone una REST API estable (POST /emails).
//   • Control total de timeouts y reintentos.
//
//  Garantías:
//   • Nunca lanza al caller. Fallar el welcome NO debe tumbar
//     el endpoint /onboarding/clinic.
//   • Cada intento queda registrado en email_log para auditoría.
//   • Modo "dry-run" automático si RESEND_API_KEY no está
//     definido (útil en local sin secretos reales).
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { env } from '../../config/env.js'
import { trackErrorSync } from '../error-tracker.js'
import type { EmailKind, RenderedEmail, SendResult } from './types.js'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const REQUEST_TIMEOUT_MS = 15_000
const MAX_RETRIES = 3
const BACKOFF_BASE_MS = 600

const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

export interface SendEmailInput {
  /** Destino. Puede ser una sola dirección o varias. */
  to: string | string[]
  /** Nombre del destinatario (opcional, mejora deliverability). */
  toName?: string | null
  /** Tipo — alimenta email_log.kind. */
  kind: EmailKind
  /** Plantilla renderizada (asunto + html + text). */
  rendered: RenderedEmail
  /** Tenant asociado (null para emails de sistema). */
  clinicId?: string | null
  /** From custom — por default usa RESEND_FROM. */
  from?: string
  /** Reply-to custom — por default usa RESEND_REPLY_TO. */
  replyTo?: string
  /** Payload arbitrario para debug (campos usados al renderear). */
  payload?: Record<string, unknown>
  /** Tags para Resend (max 10, lowercase). */
  tags?: { name: string; value: string }[]
  /** Si true, no intenta enviar — solo registra (útil para tests). */
  dryRun?: boolean
}

/**
 * Punto único de envío. Resuelve siempre, nunca lanza.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const recipients = Array.isArray(input.to) ? input.to : [input.to]
  const primary = recipients[0] ?? ''

  // 1. Validación mínima de email (no es RFC completo, pero filtra basura)
  const looksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primary)
  if (!looksValid) {
    return logAndReturn({
      clinicId: input.clinicId,
      toEmail: primary,
      toName: input.toName,
      kind: input.kind,
      subject: input.rendered.subject,
      status: 'skipped',
      error: 'Destinatario inválido',
      payload: input.payload,
    })
  }

  // 2. Modo dry-run (sin API key o forzado): solo log, status=skipped
  if (!env.RESEND_API_KEY || input.dryRun) {
    return logAndReturn({
      clinicId: input.clinicId,
      toEmail: primary,
      toName: input.toName,
      kind: input.kind,
      subject: input.rendered.subject,
      status: 'skipped',
      error: env.RESEND_API_KEY ? 'dry_run' : 'RESEND_API_KEY no configurada',
      payload: input.payload,
    })
  }

  // 3. Construir cuerpo Resend
  const body: Record<string, unknown> = {
    from: input.from ?? env.RESEND_FROM,
    to: recipients,
    subject: input.rendered.subject,
    html: input.rendered.html,
    text: input.rendered.text,
  }
  if (input.replyTo ?? env.RESEND_REPLY_TO) {
    body['reply_to'] = input.replyTo ?? env.RESEND_REPLY_TO
  }
  if (input.tags?.length) {
    body['tags'] = input.tags.slice(0, 10).map((t) => ({
      name: t.name.toLowerCase().slice(0, 50),
      value: t.value.toLowerCase().slice(0, 50),
    }))
  }

  // 4. Enviar con retry exponencial
  let lastError: string | null = null
  let providerId: string | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await postToResend(body)
      if (result.ok) {
        providerId = result.id
        lastError = null
        break
      }
      lastError = result.error
      // Códigos definitivos (validación) → no reintentar
      if (result.terminal) break
    } catch (err) {
      lastError = (err as Error).message
    }

    if (attempt < MAX_RETRIES) {
      const wait = BACKOFF_BASE_MS * Math.pow(2, attempt - 1)
      await new Promise((r) => setTimeout(r, wait))
    }
  }

  // 5. Persistir resultado
  if (providerId) {
    return logAndReturn({
      clinicId: input.clinicId,
      toEmail: primary,
      toName: input.toName,
      kind: input.kind,
      subject: input.rendered.subject,
      status: 'sent',
      providerId,
      payload: input.payload,
    })
  }

  // Falla "blanda": no rompemos al caller pero sí registramos
  trackErrorSync({
    source: 'system',
    code: 'EMAIL_SEND_FAILED',
    severity: 'warning',
    error: new Error(lastError ?? 'unknown'),
    clinicId: input.clinicId ?? null,
    context: { kind: input.kind, to: primary, subject: input.rendered.subject, mailer: 'resend' },
  })

  return logAndReturn({
    clinicId: input.clinicId,
    toEmail: primary,
    toName: input.toName,
    kind: input.kind,
    subject: input.rendered.subject,
    status: 'failed',
    error: lastError ?? 'Error desconocido',
    payload: input.payload,
  })
}

// ────────────────────────────────────────────────────────
//  POST a Resend (con timeout)
// ────────────────────────────────────────────────────────
interface PostResult {
  ok: boolean
  id: string | null
  error: string | null
  terminal: boolean // si true, no tiene sentido reintentar
}

async function postToResend(body: Record<string, unknown>): Promise<PostResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timer)

    const text = await res.text()
    let parsed: { id?: string; message?: string; name?: string } = {}
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      /* respuesta no-JSON, mantenemos parsed vacío */
    }

    if (res.ok && parsed.id) {
      return { ok: true, id: parsed.id, error: null, terminal: false }
    }

    const errMsg =
      parsed.message ??
      parsed.name ??
      text.slice(0, 200) ??
      `HTTP ${res.status}`
    // 4xx = error del cliente (subject vacío, dominio no verificado, etc.)
    // No reintentar.
    const terminal = res.status >= 400 && res.status < 500
    return { ok: false, id: null, error: errMsg, terminal }
  } catch (err) {
    clearTimeout(timer)
    if ((err as Error).name === 'AbortError') {
      return { ok: false, id: null, error: 'timeout', terminal: false }
    }
    return {
      ok: false,
      id: null,
      error: (err as Error).message,
      terminal: false,
    }
  }
}

// ────────────────────────────────────────────────────────
//  Registro en email_log (siempre, pase o no pase)
// ────────────────────────────────────────────────────────
interface LogParams {
  clinicId?: string | null
  toEmail: string
  toName?: string | null
  kind: EmailKind
  subject: string
  status: 'sent' | 'failed' | 'skipped'
  providerId?: string | null
  error?: string | null
  payload?: Record<string, unknown>
}

async function logAndReturn(p: LogParams): Promise<SendResult> {
  const sentAt = p.status === 'sent' ? new Date().toISOString() : null

  const { data, error } = await supabaseAdmin
    .from('email_log')
    .insert({
      clinic_id: p.clinicId ?? null,
      to_email: p.toEmail,
      to_name: p.toName ?? null,
      kind: p.kind,
      subject: p.subject,
      status: p.status,
      provider_id: p.providerId ?? null,
      error: p.error ?? null,
      payload: p.payload ?? {},
      sent_at: sentAt,
    })
    .select('id')
    .single<{ id: string }>()

  if (error) {
    // Si ni siquiera podemos loguear, al menos lo gritamos a stderr.
    console.error('[Mailer] No se pudo escribir email_log:', error.message)
    return {
      id: 'unlogged',
      status: p.status,
      provider_id: p.providerId ?? null,
      error: p.error ?? null,
    }
  }

  return {
    id: data.id,
    status: p.status,
    provider_id: p.providerId ?? null,
    error: p.error ?? null,
  }
}
