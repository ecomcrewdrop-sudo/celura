// ============================================================
//  CELURA · Rutas /api/notifications/*
//  ------------------------------------------------------------
//   • GET    /notifications              — listado paginado
//   • GET    /notifications/unread-count — contador para el bell
//   • POST   /notifications/:id/read     — marcar leída
//   • POST   /notifications/mark-all-read
//   • POST   /notifications/:id/archive  — archivar (soft-delete)
//   • GET    /notifications/preferences  — preferencias del user
//   • PATCH  /notifications/preferences  — upsert una preferencia
//
//  Auth: heredan del plugin tenant (request.tenant.clinic_id +
//  request.user.sub). RLS en Supabase fuerza filtrado por owner.
// ============================================================

import { FastifyInstance } from 'fastify'
import { z } from 'zod'

export default async function notificationsRoutes(fastify: FastifyInstance) {
  // ────────────────────────────────────────────────────────
  //  GET /notifications
  // ────────────────────────────────────────────────────────
  fastify.get<{
    Querystring: {
      limit?: string
      cursor?: string
      unread?: string
      include_archived?: string
    }
  }>('/notifications', async (req, reply) => {
    const tenant = (req as any).tenant
    if (!tenant?.clinic_id) {
      return reply.status(401).send({ error: 'No autenticado' })
    }

    const limit = Math.min(parseInt(req.query.limit ?? '30', 10) || 30, 100)
    const cursor = req.query.cursor // ISO timestamp del último visto
    const onlyUnread = req.query.unread === 'true'
    const includeArchived = req.query.include_archived === 'true'

    const supabase = (req as any).supabase
    let q = supabase
      .from('notifications')
      .select(
        'id, kind, severity, title, body, icon, action_url, action_label, entity_type, entity_id, metadata, read_at, archived_at, created_at, expires_at',
      )
      .order('created_at', { ascending: false })
      .limit(limit + 1) // +1 para saber si hay next page

    if (!includeArchived) q = q.is('archived_at', null)
    if (onlyUnread) q = q.is('read_at', null)
    if (cursor) q = q.lt('created_at', cursor)

    // Filtrar expiradas (server-side)
    const nowIso = new Date().toISOString()
    q = q.or(`expires_at.is.null,expires_at.gt.${nowIso}`)

    const { data, error } = await q
    if (error) {
      req.log.error({ err: error }, 'notifications list failed')
      return reply.status(500).send({ error: 'No se pudieron cargar' })
    }

    const items = (data ?? []).slice(0, limit)
    const next_cursor =
      (data?.length ?? 0) > limit ? items[items.length - 1]?.created_at : null

    return { items, next_cursor }
  })

  // ────────────────────────────────────────────────────────
  //  GET /notifications/unread-count
  // ────────────────────────────────────────────────────────
  fastify.get('/notifications/unread-count', async (req, reply) => {
    const supabase = (req as any).supabase
    const nowIso = new Date().toISOString()
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .is('archived_at', null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)

    if (error) {
      return reply.status(500).send({ error: 'No se pudo contar' })
    }
    return { unread: count ?? 0 }
  })

  // ────────────────────────────────────────────────────────
  //  POST /notifications/:id/read
  // ────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/notifications/:id/read',
    async (req, reply) => {
      const supabase = (req as any).supabase
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .is('read_at', null)

      if (error) return reply.status(500).send({ error: error.message })
      return { ok: true }
    },
  )

  // ────────────────────────────────────────────────────────
  //  POST /notifications/mark-all-read
  // ────────────────────────────────────────────────────────
  fastify.post('/notifications/mark-all-read', async (req, reply) => {
    const supabase = (req as any).supabase
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .is('archived_at', null)

    if (error) return reply.status(500).send({ error: error.message })
    return { ok: true }
  })

  // ────────────────────────────────────────────────────────
  //  POST /notifications/:id/archive
  // ────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/notifications/:id/archive',
    async (req, reply) => {
      const supabase = (req as any).supabase
      const { error } = await supabase
        .from('notifications')
        .update({
          archived_at: new Date().toISOString(),
          read_at: new Date().toISOString(),
        })
        .eq('id', req.params.id)

      if (error) return reply.status(500).send({ error: error.message })
      return { ok: true }
    },
  )

  // ────────────────────────────────────────────────────────
  //  GET /notifications/preferences
  // ────────────────────────────────────────────────────────
  fastify.get('/notifications/preferences', async (req, reply) => {
    const supabase = (req as any).supabase
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('kind, email_enabled, inapp_enabled, updated_at')
      .order('kind')

    if (error) return reply.status(500).send({ error: error.message })
    return { preferences: data ?? [] }
  })

  // ────────────────────────────────────────────────────────
  //  PATCH /notifications/preferences
  // ────────────────────────────────────────────────────────
  const prefsPatchSchema = z.object({
    kind: z.string().min(1),
    email_enabled: z.boolean().optional(),
    inapp_enabled: z.boolean().optional(),
  })

  fastify.patch('/notifications/preferences', async (req, reply) => {
    const parsed = prefsPatchSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Datos inválidos', issues: parsed.error.issues })
    }
    const user = (req as any).user as { sub?: string } | undefined
    if (!user?.sub) {
      return reply.status(401).send({ error: 'No autenticado' })
    }

    const supabase = (req as any).supabase
    const payload: Record<string, unknown> = {
      user_id: user.sub,
      kind: parsed.data.kind,
    }
    if (parsed.data.email_enabled !== undefined) {
      payload['email_enabled'] = parsed.data.email_enabled
    }
    if (parsed.data.inapp_enabled !== undefined) {
      payload['inapp_enabled'] = parsed.data.inapp_enabled
    }

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(payload, { onConflict: 'user_id,kind' })

    if (error) return reply.status(500).send({ error: error.message })
    return { ok: true }
  })
}
