// ============================================================
//  CELURA · Rutas del panel admin
//  ------------------------------------------------------------
//  Todos los endpoints viven bajo /admin/* y están protegidos
//  por el plugin admin (verifica rol). Cada acción de mutación
//  registra una entrada en admin_logs para auditoría.
//
//  Secciones:
//   • /admin/me              · identidad + rol del admin actual
//   • /admin/overview        · KPIs globales del sistema
//   • /admin/clinics         · listado + detalle + mutaciones
//   • /admin/users           · listado de usuarios auth
//   • /admin/announcements   · CRUD de anuncios globales
//   • /admin/logs            · feed de auditoría
//   • /admin/wa-sessions     · estado de las sesiones WhatsApp
// ============================================================

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { logFromRequest } from '../services/admin-log.js'
import {
  getSessionStatus,
  closeSession,
  deleteSession,
} from '../services/whatsapp.js'

// Cliente con service_role para queries que necesitan ver TODO
// (saltando RLS). Los endpoints admin lo usan deliberadamente.
const supabaseAdmin = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { persistSession: false } },
)

// ── Schemas de validación ─────────────────────────────────
const clinicPatchSchema = z.object({
  plan: z.enum(['trial', 'esencial', 'pro', 'clinica']).optional(),
  status: z.enum(['active', 'suspended', 'cancelled', 'trial']).optional(),
  is_beta: z.boolean().optional(),
  trial_ends_at: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).optional(),
})

const blockClinicSchema = z.object({
  reason: z.string().min(3).max(500),
  unblock_at: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).optional(),
})

const extendTrialSchema = z.object({
  days: z.number().int().min(1).max(365),
})

const announcementCreateSchema = z.object({
  title: z.string().min(2).max(120),
  body: z.string().min(2).max(2000),
  severity: z.enum(['info', 'warning', 'success', 'promo', 'maintenance']).default('info'),
  audience: z.enum(['all', 'trial', 'paid', 'beta', 'specific']).default('all'),
  audience_ids: z.array(z.string().uuid()).nullable().optional(),
  cta_label: z.string().max(60).nullable().optional(),
  cta_url: z.string().url().nullable().optional(),
  starts_at: z.string().datetime().nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
  dismissible: z.boolean().default(true),
  is_active: z.boolean().default(true),
})

const announcementPatchSchema = announcementCreateSchema.partial()

export default async function adminRoutes(fastify: FastifyInstance) {
  // ────────────────────────────────────────────────────────
  //  GET /admin/me — identidad del admin actual
  // ────────────────────────────────────────────────────────
  fastify.get('/admin/me', async (req) => {
    return {
      user_id: req.admin!.user_id,
      role: req.admin!.role,
    }
  })

  // ────────────────────────────────────────────────────────
  //  GET /admin/overview — KPIs globales
  // ────────────────────────────────────────────────────────
  fastify.get('/admin/overview', async () => {
    const [
      clinics,
      activeClinics,
      trialClinics,
      suspendedClinics,
      betaClinics,
      waConnected,
      leadsTotal,
      apptsUpcoming,
      announcements,
      newClinics7d,
      newLeads7d,
    ] = await Promise.all([
      supabaseAdmin.from('clinics').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('clinics').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabaseAdmin.from('clinics').select('id', { count: 'exact', head: true }).eq('plan', 'trial'),
      supabaseAdmin.from('clinics').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
      supabaseAdmin.from('clinics').select('id', { count: 'exact', head: true }).eq('is_beta', true),
      supabaseAdmin.from('clinic_config').select('clinic_id', { count: 'exact', head: true }).eq('wa_connected', true),
      supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('appointments').select('id', { count: 'exact', head: true }).in('status', ['scheduled', 'confirmed']),
      supabaseAdmin.from('announcements').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabaseAdmin
        .from('clinics')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
    ])

    return {
      clinics: {
        total: clinics.count ?? 0,
        active: activeClinics.count ?? 0,
        trial: trialClinics.count ?? 0,
        suspended: suspendedClinics.count ?? 0,
        beta: betaClinics.count ?? 0,
        new_7d: newClinics7d.count ?? 0,
        wa_connected: waConnected.count ?? 0,
      },
      leads: {
        total: leadsTotal.count ?? 0,
        new_7d: newLeads7d.count ?? 0,
      },
      appointments: {
        upcoming: apptsUpcoming.count ?? 0,
      },
      announcements: {
        active: announcements.count ?? 0,
      },
    }
  })

  // ────────────────────────────────────────────────────────
  //  GET /admin/clinics — listado con filtros y paginación
  // ────────────────────────────────────────────────────────
  fastify.get<{
    Querystring: {
      q?: string
      plan?: string
      status?: string
      is_beta?: string
      wa?: string
      limit?: string
      offset?: string
      order?: string
    }
  }>('/admin/clinics', async (req) => {
    const limit = Math.min(parseInt(req.query.limit ?? '50', 10) || 50, 200)
    const offset = parseInt(req.query.offset ?? '0', 10) || 0
    const order = req.query.order ?? 'created_at.desc'
    const [orderCol, orderDir] = order.split('.')

    let query = supabaseAdmin.from('admin_clinic_overview').select('*', { count: 'exact' })

    if (req.query.q) {
      const q = req.query.q.trim()
      query = query.or(`clinic_name.ilike.%${q}%,slug.ilike.%${q}%,wa_phone.ilike.%${q}%`)
    }
    if (req.query.plan) query = query.eq('plan', req.query.plan)
    if (req.query.status) query = query.eq('status', req.query.status)
    if (req.query.is_beta === 'true') query = query.eq('is_beta', true)
    if (req.query.is_beta === 'false') query = query.eq('is_beta', false)
    if (req.query.wa === 'true') query = query.eq('wa_connected', true)
    if (req.query.wa === 'false') query = query.eq('wa_connected', false)

    query = query
      .order(orderCol ?? 'created_at', { ascending: orderDir === 'asc' })
      .range(offset, offset + limit - 1)

    const { data, count, error } = await query
    if (error) throw error

    return {
      items: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    }
  })

  // ────────────────────────────────────────────────────────
  //  GET /admin/clinics/:id — detalle completo
  // ────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/admin/clinics/:id', async (req, reply) => {
    const { id } = req.params

    const [clinic, config, blocks, recentLogs] = await Promise.all([
      supabaseAdmin.from('admin_clinic_overview').select('*').eq('clinic_id', id).maybeSingle(),
      supabaseAdmin.from('clinic_config').select('*').eq('clinic_id', id).maybeSingle(),
      supabaseAdmin
        .from('clinic_blocks')
        .select('*')
        .eq('clinic_id', id)
        .order('blocked_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('admin_logs')
        .select('*')
        .eq('target_type', 'clinic')
        .eq('target_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (!clinic.data) {
      return reply.status(404).send({ error: 'Clínica no encontrada' })
    }

    // Datos del dueño desde auth.users (vía service_role)
    const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(
      (clinic.data as { owner_id: string }).owner_id,
    )

    // Estado real del socket WhatsApp en memoria del proceso
    const waSessionStatus = getSessionStatus(id)

    return {
      clinic: clinic.data,
      config: config.data,
      owner: ownerData?.user
        ? {
            id: ownerData.user.id,
            email: ownerData.user.email,
            full_name:
              (ownerData.user.user_metadata as { full_name?: string } | null)?.full_name ?? null,
            last_sign_in_at: ownerData.user.last_sign_in_at,
            created_at: ownerData.user.created_at,
          }
        : null,
      blocks: blocks.data ?? [],
      recent_logs: recentLogs.data ?? [],
      wa_runtime_status: waSessionStatus,
    }
  })

  // ────────────────────────────────────────────────────────
  //  PATCH /admin/clinics/:id — editar plan/status/beta/trial
  // ────────────────────────────────────────────────────────
  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    '/admin/clinics/:id',
    async (req, reply) => {
      const parsed = clinicPatchSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message })
      }
      const { id } = req.params
      const updates = parsed.data

      const { data, error } = await supabaseAdmin
        .from('clinics')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) return reply.status(400).send({ error: error.message })

      // Invalidar cache del tenant para que el doctor vea el cambio
      fastify.invalidateTenantCache((data as { owner_id: string }).owner_id)

      logFromRequest(req, 'clinic.patch', { type: 'clinic', id }, updates)
      return data
    },
  )

  // ────────────────────────────────────────────────────────
  //  POST /admin/clinics/:id/extend-trial
  // ────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/admin/clinics/:id/extend-trial',
    async (req, reply) => {
      const parsed = extendTrialSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message })
      }
      const { id } = req.params
      const { days } = parsed.data

      const { data, error } = await supabaseAdmin.rpc('admin_extend_trial', {
        p_clinic_id: id,
        p_days: days,
      })
      if (error) return reply.status(400).send({ error: error.message })

      // Refrescar dueño para invalidar cache
      const { data: clinic } = await supabaseAdmin
        .from('clinics')
        .select('owner_id')
        .eq('id', id)
        .single()
      if (clinic) fastify.invalidateTenantCache((clinic as { owner_id: string }).owner_id)

      logFromRequest(req, 'clinic.extend_trial', { type: 'clinic', id }, { days })
      return { new_trial_ends_at: data }
    },
  )

  // ────────────────────────────────────────────────────────
  //  POST /admin/clinics/:id/block — suspender con razón
  // ────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/admin/clinics/:id/block',
    async (req, reply) => {
      const parsed = blockClinicSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message })
      }
      const { id } = req.params

      // 1. Insertar registro de bloqueo
      const { error: insErr } = await supabaseAdmin.from('clinic_blocks').insert({
        clinic_id: id,
        reason: parsed.data.reason,
        unblock_at: parsed.data.unblock_at ?? null,
        notes: parsed.data.notes ?? null,
        blocked_by: req.admin!.user_id,
      })
      if (insErr) return reply.status(400).send({ error: insErr.message })

      // 2. Suspender la clínica
      const { data: clinic, error: updErr } = await supabaseAdmin
        .from('clinics')
        .update({ status: 'suspended' })
        .eq('id', id)
        .select('owner_id')
        .single()
      if (updErr) return reply.status(400).send({ error: updErr.message })

      // 3. Cerrar sesión WhatsApp si está activa (mejor effort)
      try {
        await closeSession(id)
      } catch {
        /* ignore */
      }

      if (clinic) fastify.invalidateTenantCache((clinic as { owner_id: string }).owner_id)

      logFromRequest(req, 'clinic.block', { type: 'clinic', id }, parsed.data)
      return { ok: true }
    },
  )

  // ────────────────────────────────────────────────────────
  //  POST /admin/clinics/:id/unblock — reactivar
  // ────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/admin/clinics/:id/unblock',
    async (req, reply) => {
      const { id } = req.params

      // 1. Marcar último bloqueo activo como desbloqueado
      const { data: lastBlock } = await supabaseAdmin
        .from('clinic_blocks')
        .select('id')
        .eq('clinic_id', id)
        .is('unblocked_at', null)
        .order('blocked_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastBlock) {
        await supabaseAdmin
          .from('clinic_blocks')
          .update({
            unblocked_at: new Date().toISOString(),
            unblocked_by: req.admin!.user_id,
          })
          .eq('id', (lastBlock as { id: string }).id)
      }

      // 2. Reactivar clínica
      const { data: clinic, error } = await supabaseAdmin
        .from('clinics')
        .update({ status: 'active' })
        .eq('id', id)
        .select('owner_id')
        .single()
      if (error) return reply.status(400).send({ error: error.message })

      if (clinic) fastify.invalidateTenantCache((clinic as { owner_id: string }).owner_id)

      logFromRequest(req, 'clinic.unblock', { type: 'clinic', id })
      return { ok: true }
    },
  )

  // ────────────────────────────────────────────────────────
  //  POST /admin/clinics/:id/reset-wa — forzar logout WhatsApp
  // ────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/admin/clinics/:id/reset-wa',
    async (req) => {
      const { id } = req.params
      try {
        await closeSession(id)
      } catch {
        /* ignore */
      }
      deleteSession(id)
      await supabaseAdmin
        .from('clinic_config')
        .update({ wa_connected: false, wa_phone: null, wa_connected_at: null })
        .eq('clinic_id', id)

      logFromRequest(req, 'clinic.reset_wa', { type: 'clinic', id })
      return { ok: true }
    },
  )

  // ────────────────────────────────────────────────────────
  //  GET /admin/users — listado de usuarios auth
  // ────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { page?: string; perPage?: string } }>(
    '/admin/users',
    async (req) => {
      const page = parseInt(req.query.page ?? '1', 10) || 1
      const perPage = Math.min(parseInt(req.query.perPage ?? '50', 10) || 50, 200)

      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      })
      if (error) throw error

      // Enriquecer con info de clínica (owner_id → clinic)
      const userIds = data.users.map((u) => u.id)
      const { data: clinics } = await supabaseAdmin
        .from('clinics')
        .select('id, name, plan, status, owner_id')
        .in('owner_id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'])
      const clinicByOwner = new Map(
        (clinics ?? []).map((c) => [(c as { owner_id: string }).owner_id, c]),
      )

      // Marcar admins
      const { data: admins } = await supabaseAdmin
        .from('admins')
        .select('user_id, role')
        .in('user_id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'])
      const adminByUser = new Map(
        (admins ?? []).map((a) => [
          (a as { user_id: string }).user_id,
          (a as { role: string }).role,
        ]),
      )

      return {
        users: data.users.map((u) => ({
          id: u.id,
          email: u.email,
          full_name: (u.user_metadata as { full_name?: string } | null)?.full_name ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          confirmed: !!u.email_confirmed_at,
          clinic: clinicByOwner.get(u.id) ?? null,
          admin_role: adminByUser.get(u.id) ?? null,
        })),
        total: data.total ?? data.users.length,
      }
    },
  )

  // ────────────────────────────────────────────────────────
  //  GET /admin/announcements — listado
  // ────────────────────────────────────────────────────────
  fastify.get('/admin/announcements', async () => {
    const { data, error } = await supabaseAdmin
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  })

  // ────────────────────────────────────────────────────────
  //  POST /admin/announcements — crear
  // ────────────────────────────────────────────────────────
  fastify.post<{ Body: unknown }>('/admin/announcements', async (req, reply) => {
    const parsed = announcementCreateSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message })
    }
    const { data, error } = await supabaseAdmin
      .from('announcements')
      .insert({ ...parsed.data, created_by: req.admin!.user_id })
      .select()
      .single()
    if (error) return reply.status(400).send({ error: error.message })

    logFromRequest(req, 'announcement.create', { type: 'announcement', id: (data as { id: string }).id }, parsed.data)
    return data
  })

  // ────────────────────────────────────────────────────────
  //  PATCH /admin/announcements/:id
  // ────────────────────────────────────────────────────────
  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    '/admin/announcements/:id',
    async (req, reply) => {
      const parsed = announcementPatchSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message })
      }
      const { data, error } = await supabaseAdmin
        .from('announcements')
        .update(parsed.data)
        .eq('id', req.params.id)
        .select()
        .single()
      if (error) return reply.status(400).send({ error: error.message })

      logFromRequest(req, 'announcement.patch', { type: 'announcement', id: req.params.id }, parsed.data)
      return data
    },
  )

  // ────────────────────────────────────────────────────────
  //  DELETE /admin/announcements/:id
  // ────────────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/admin/announcements/:id',
    async (req, reply) => {
      const { error } = await supabaseAdmin
        .from('announcements')
        .delete()
        .eq('id', req.params.id)
      if (error) return reply.status(400).send({ error: error.message })

      logFromRequest(req, 'announcement.delete', { type: 'announcement', id: req.params.id })
      return { ok: true }
    },
  )

  // ────────────────────────────────────────────────────────
  //  GET /admin/logs — feed de auditoría
  // ────────────────────────────────────────────────────────
  fastify.get<{
    Querystring: { limit?: string; offset?: string; action?: string; target_type?: string }
  }>('/admin/logs', async (req) => {
    const limit = Math.min(parseInt(req.query.limit ?? '100', 10) || 100, 500)
    const offset = parseInt(req.query.offset ?? '0', 10) || 0

    let q = supabaseAdmin.from('admin_logs').select('*', { count: 'exact' })
    if (req.query.action) q = q.eq('action', req.query.action)
    if (req.query.target_type) q = q.eq('target_type', req.query.target_type)
    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

    const { data, count, error } = await q
    if (error) throw error

    // Enriquecer con email del admin para mostrar en UI
    const adminIds = Array.from(
      new Set((data ?? []).map((l) => (l as { admin_user_id: string | null }).admin_user_id).filter(Boolean)),
    ) as string[]
    const adminEmails = new Map<string, string>()
    for (const id of adminIds) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id)
        if (u?.user?.email) adminEmails.set(id, u.user.email)
      } catch {
        /* ignore */
      }
    }

    return {
      items: (data ?? []).map((l) => {
        const log = l as { admin_user_id: string | null }
        return {
          ...l,
          admin_email: log.admin_user_id ? adminEmails.get(log.admin_user_id) ?? null : null,
        }
      }),
      total: count ?? 0,
      limit,
      offset,
    }
  })

  // ────────────────────────────────────────────────────────
  //  GET /admin/wa-sessions — estado de las sesiones WhatsApp
  // ────────────────────────────────────────────────────────
  fastify.get('/admin/wa-sessions', async () => {
    // Listamos clínicas con wa_connected=true para cruzar con runtime
    const { data: configs } = await supabaseAdmin
      .from('clinic_config')
      .select('clinic_id, wa_phone, wa_connected_at')
      .eq('wa_connected', true)

    const items = (configs ?? []).map((c) => {
      const cfg = c as { clinic_id: string; wa_phone: string | null; wa_connected_at: string | null }
      return {
        clinic_id: cfg.clinic_id,
        wa_phone: cfg.wa_phone,
        connected_at: cfg.wa_connected_at,
        runtime_status: getSessionStatus(cfg.clinic_id),
      }
    })

    return { items, total: items.length }
  })
}
