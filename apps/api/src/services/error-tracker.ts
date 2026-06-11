// ============================================================
//  CELURA · Error tracker
//  ------------------------------------------------------------
//  Captura excepciones de cualquier punto del stack y las
//  agrupa por fingerprint (hash determinístico del origen +
//  código + primer trozo del mensaje) usando la función SQL
//  track_error_event.
//
//  USO:
//    try { ... } catch (e) {
//      await trackError({ source: 'whisper', code: 'TIMEOUT', error: e, clinicId })
//    }
//
//  Es fire-and-forget: nunca lanza, nunca bloquea el flujo.
// ============================================================

import { createHash } from 'node:crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export type ErrorSource =
  | 'whisper'
  | 'claude'
  | 'openai'
  | 'baileys'
  | 'fastify'
  | 'webhook'
  | 'supabase'
  | 'system'

export type ErrorSeverity = 'warning' | 'error' | 'critical'

interface TrackInput {
  source: ErrorSource
  /** Código corto agrupable: TIMEOUT, HTTP_500, AUTH_FAILED, CONNECTION_LOST… */
  code?: string
  /** Severidad. Default 'error'. */
  severity?: ErrorSeverity
  /** El error original o un mensaje plano. */
  error: unknown
  /** Clínica asociada (si aplica). */
  clinicId?: string | null
  /** Contexto adicional: request id, conversation id, etc. */
  context?: Record<string, unknown>
  /** Opcional: forzar título corto distinto del error.message. */
  title?: string
}

let _client: SupabaseClient | null = null
function client(): SupabaseClient {
  if (_client) return _client
  _client = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  )
  return _client
}

function asError(e: unknown): { name: string; message: string; stack: string | null } {
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack ?? null }
  }
  if (typeof e === 'string') return { name: 'Error', message: e, stack: null }
  try {
    return { name: 'Error', message: JSON.stringify(e), stack: null }
  } catch {
    return { name: 'Error', message: String(e), stack: null }
  }
}

function fingerprint(source: string, code: string | undefined, msg: string): string {
  // Usamos primeros 120 chars del mensaje para no perder discriminación
  // pero ignorando UUIDs y números (para agrupar bien errores parametrizados).
  const normalized = msg
    .slice(0, 120)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b\d{4,}\b/g, '<n>')
  const raw = `${source}|${code ?? '-'}|${normalized}`
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

/**
 * Registra un error. Nunca lanza; cualquier fallo se loggea por consola
 * para no esconder problemas del tracker mismo.
 */
export async function trackError(input: TrackInput): Promise<void> {
  try {
    const { source, code, severity = 'error', error, clinicId, context, title } = input
    const err = asError(error)
    const shortTitle = (title ?? err.message ?? err.name).slice(0, 200)
    const fp = fingerprint(source, code, shortTitle)

    const { error: rpcErr } = await client().rpc('track_error_event', {
      p_fingerprint: fp,
      p_source: source,
      p_severity: severity,
      p_code: code ?? null,
      p_title: shortTitle,
      p_detail: err.message,
      p_stack: err.stack,
      p_clinic_id: clinicId ?? null,
      p_context: (context ?? {}) as Record<string, unknown>,
    })

    if (rpcErr) {
      console.warn('[error-tracker] RPC failed:', rpcErr.message)
    }
  } catch (e) {
    console.warn('[error-tracker] swallowed:', e)
  }
}

/**
 * Helper sincrónico: dispara el track sin esperar. Útil dentro de catch
 * cuando no se quiere convertir la función en async sólo para esto.
 */
export function trackErrorSync(input: TrackInput): void {
  void trackError(input)
}
