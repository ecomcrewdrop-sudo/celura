// ============================================================
//  CELURA · Plugin de autorización admin
//  ------------------------------------------------------------
//  Se registra como preHandler en las rutas /admin/*.
//  Asume que `tenant` ya verificó el JWT y dejó la identidad
//  en request.user. Solo añade el chequeo de pertenencia a la
//  tabla `admins` y decora request.admin con su rol.
// ============================================================

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import type { AdminRole } from '../types/admin.js'

// Cache en memoria de quiénes son admin. TTL corto para que
// revocar un admin tenga efecto rápido sin reiniciar.
const adminCache = new Map<string, { role: AdminRole; at: number }>()
const ADMIN_CACHE_TTL_MS = 30_000 // 30s

async function adminPlugin(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.startsWith('/admin/') && request.url !== '/admin') return

    // ── 1. Identidad ya verificada por el plugin tenant ──
    const user = request.user as { sub?: string } | undefined
    const userId = user?.sub
    if (!userId) {
      return reply.status(401).send({ error: 'No autenticado' })
    }

    // ── 2. Cache hit ──
    const cached = adminCache.get(userId)
    if (cached && Date.now() - cached.at < ADMIN_CACHE_TTL_MS) {
      request.admin = { user_id: userId, role: cached.role }
      return
    }

    // ── 3. Buscar en tabla admins (vía service_role para saltar RLS) ──
    const { data, error } = await fastify.supabaseAdmin
      .from('admins')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle<{ role: AdminRole }>()

    if (error || !data) {
      // Registramos un intento de acceso (sin user_id por si fue manipulación)
      request.log.warn({ userId, url: request.url }, 'Intento de acceso admin denegado')
      return reply.status(403).send({
        error: 'No tienes permiso para acceder al panel de administración.',
      })
    }

    adminCache.set(userId, { role: data.role, at: Date.now() })
    request.admin = { user_id: userId, role: data.role }
  })

  // Exponer un invalidador por si añadimos/removemos admins en runtime
  fastify.decorate('invalidateAdminCache', (userId?: string) => {
    if (userId) adminCache.delete(userId)
    else adminCache.clear()
  })
}

declare module 'fastify' {
  interface FastifyInstance {
    invalidateAdminCache: (userId?: string) => void
  }
}

export default fp(adminPlugin, {
  name: 'admin',
  dependencies: ['tenant'],
})
