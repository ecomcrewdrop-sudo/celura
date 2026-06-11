// ============================================================
//  CELURA · Helper de auditoría admin
//  Cada acción del panel se registra de forma inmutable en
//  la tabla admin_logs. No usa el cliente con JWT del request
//  sino el service_role (RLS bloquea INSERT desde el frontend).
// ============================================================

import { createClient } from '@supabase/supabase-js'
import type { FastifyRequest } from 'fastify'

const supabaseAdmin = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { persistSession: false } },
)

export interface LogAdminActionInput {
  adminUserId: string
  action: string
  targetType?: string | null
  targetId?: string | null
  payload?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

/**
 * Registra una acción del admin de forma fire-and-forget.
 * Nunca tira excepción al caller: si Supabase falla, lo logueamos
 * pero la operación principal sigue.
 */
export async function logAdminAction(input: LogAdminActionInput): Promise<void> {
  try {
    await supabaseAdmin.from('admin_logs').insert({
      admin_user_id: input.adminUserId,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      payload: input.payload ?? {},
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    })
  } catch (err) {
    // No bloqueamos la respuesta por un fallo de auditoría
    console.error('[AdminLog] Fallo registrando acción:', (err as Error).message)
  }
}

/**
 * Versión que extrae ip y user-agent automáticamente del request.
 * Devuelve void inmediatamente; la escritura se hace en background.
 */
export function logFromRequest(
  request: FastifyRequest,
  action: string,
  target?: { type?: string; id?: string },
  payload?: Record<string, unknown>,
): void {
  const adminUserId = request.admin?.user_id
  if (!adminUserId) return
  void logAdminAction({
    adminUserId,
    action,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    payload: payload ?? {},
    ip: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
  })
}
