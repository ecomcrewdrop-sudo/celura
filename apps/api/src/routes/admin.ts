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
import {
  sendEmail,
  sendWelcomeEmail,
  sendTrialEndingEmail,
  sendPaymentPendingEmail,
  sendAppointmentConfirmationEmail,
  sendWaConnectedEmail,
  sendDailySummaryEmail,
} from '../services/email/index.js'

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

const promoCreateSchema = z.object({
  code: z.string().min(3).max(50).regex(/^[A-Za-z0-9_\-]+$/, 'Solo letras, números, guiones y guiones bajos'),
  kind: z.enum(['discount_pct', 'discount_amount', 'trial_extend', 'plan_upgrade']),
  value: z.number().min(0).max(100000),
  currency: z.string().length(3).optional(),
  target_plan: z.enum(['esencial', 'pro', 'clinica']).nullable().optional(),
  applies_to_plans: z.array(z.enum(['trial', 'esencial', 'pro', 'clinica'])).nullable().optional(),
  max_redemptions: z.number().int().positive().nullable().optional(),
  starts_at: z.string().datetime().nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
  is_active: z.boolean().default(true),
  affiliate_user_id: z.string().uuid().nullable().optional(),
  affiliate_commission_pct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

const promoPatchSchema = promoCreateSchema.partial()

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

  // ════════════════════════════════════════════════════════
  //  PROMO CODES · /admin/promo-codes
  // ════════════════════════════════════════════════════════

  // GET /admin/promo-codes — listado con stats de redenciones
  fastify.get<{ Querystring: { q?: string; active?: string } }>(
    '/admin/promo-codes',
    async (req) => {
      let q = supabaseAdmin.from('promo_codes').select('*').order('created_at', { ascending: false })
      if (req.query.q) {
        q = q.ilike('code', `%${req.query.q.trim()}%`)
      }
      if (req.query.active === 'true') q = q.eq('is_active', true)
      if (req.query.active === 'false') q = q.eq('is_active', false)
      const { data, error } = await q
      if (error) throw error
      return { items: data ?? [], total: data?.length ?? 0 }
    },
  )

  // GET /admin/promo-codes/:id — detalle + redenciones recientes
  fastify.get<{ Params: { id: string } }>('/admin/promo-codes/:id', async (req, reply) => {
    const [promo, redemptions] = await Promise.all([
      supabaseAdmin.from('promo_codes').select('*').eq('id', req.params.id).maybeSingle(),
      supabaseAdmin
        .from('promo_redemptions')
        .select('*, clinics!inner(id, name, slug)')
        .eq('promo_code_id', req.params.id)
        .order('redeemed_at', { ascending: false })
        .limit(100),
    ])
    if (!promo.data) return reply.status(404).send({ error: 'Código no encontrado' })

    return {
      promo: promo.data,
      redemptions: redemptions.data ?? [],
    }
  })

  // POST /admin/promo-codes — crear
  fastify.post<{ Body: unknown }>('/admin/promo-codes', async (req, reply) => {
    const parsed = promoCreateSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message })
    }
    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .insert({ ...parsed.data, code: parsed.data.code.toUpperCase(), created_by: req.admin!.user_id })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') return reply.status(409).send({ error: 'Ese código ya existe' })
      return reply.status(400).send({ error: error.message })
    }
    logFromRequest(req, 'promo.create', { type: 'promo_code', id: (data as { id: string }).id }, parsed.data)
    return data
  })

  // PATCH /admin/promo-codes/:id — editar
  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    '/admin/promo-codes/:id',
    async (req, reply) => {
      const parsed = promoPatchSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message })
      }
      const payload: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() }
      if (typeof parsed.data.code === 'string') payload['code'] = parsed.data.code.toUpperCase()
      const { data, error } = await supabaseAdmin
        .from('promo_codes')
        .update(payload)
        .eq('id', req.params.id)
        .select()
        .single()
      if (error) return reply.status(400).send({ error: error.message })
      logFromRequest(req, 'promo.patch', { type: 'promo_code', id: req.params.id }, parsed.data)
      return data
    },
  )

  // DELETE /admin/promo-codes/:id — eliminar (cascade redemptions)
  fastify.delete<{ Params: { id: string } }>('/admin/promo-codes/:id', async (req, reply) => {
    const { error } = await supabaseAdmin.from('promo_codes').delete().eq('id', req.params.id)
    if (error) return reply.status(400).send({ error: error.message })
    logFromRequest(req, 'promo.delete', { type: 'promo_code', id: req.params.id })
    return { ok: true }
  })

  // ════════════════════════════════════════════════════════
  //  ERROR EVENTS · /admin/errors
  // ════════════════════════════════════════════════════════

  // GET /admin/errors — feed agrupado por fingerprint
  fastify.get<{
    Querystring: {
      source?: string
      severity?: string
      resolved?: string
      clinic_id?: string
      limit?: string
      offset?: string
    }
  }>('/admin/errors', async (req) => {
    const limit = Math.min(parseInt(req.query.limit ?? '100', 10) || 100, 500)
    const offset = parseInt(req.query.offset ?? '0', 10) || 0

    let q = supabaseAdmin.from('error_events').select('*', { count: 'exact' })
    if (req.query.source) q = q.eq('source', req.query.source)
    if (req.query.severity) q = q.eq('severity', req.query.severity)
    if (req.query.clinic_id) q = q.eq('clinic_id', req.query.clinic_id)
    if (req.query.resolved === 'true') q = q.not('resolved_at', 'is', null)
    if (req.query.resolved === 'false') q = q.is('resolved_at', null)
    q = q.order('last_seen_at', { ascending: false }).range(offset, offset + limit - 1)

    const { data, count, error } = await q
    if (error) throw error
    return { items: data ?? [], total: count ?? 0, limit, offset }
  })

  // GET /admin/errors/stats — para el dashboard de salud
  fastify.get('/admin/errors/stats', async () => {
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()
    const since1h = new Date(Date.now() - 3600_000).toISOString()
    const [unresolved, critical24h, last1h, bySource] = await Promise.all([
      supabaseAdmin.from('error_events').select('id', { count: 'exact', head: true }).is('resolved_at', null),
      supabaseAdmin.from('error_events').select('id', { count: 'exact', head: true })
        .eq('severity', 'critical').gte('last_seen_at', since24h),
      supabaseAdmin.from('error_events').select('id', { count: 'exact', head: true }).gte('last_seen_at', since1h),
      supabaseAdmin.from('error_events').select('source').gte('last_seen_at', since24h),
    ])

    const sources: Record<string, number> = {}
    for (const row of (bySource.data ?? []) as { source: string }[]) {
      sources[row.source] = (sources[row.source] ?? 0) + 1
    }

    return {
      unresolved: unresolved.count ?? 0,
      critical_24h: critical24h.count ?? 0,
      last_1h: last1h.count ?? 0,
      by_source: sources,
    }
  })

  // POST /admin/errors/:id/resolve — marcar como resuelto
  fastify.post<{ Params: { id: string } }>('/admin/errors/:id/resolve', async (req, reply) => {
    const { error } = await supabaseAdmin
      .from('error_events')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: req.admin!.user_id,
      })
      .eq('id', req.params.id)
    if (error) return reply.status(400).send({ error: error.message })
    logFromRequest(req, 'error.resolve', { type: 'error_event', id: req.params.id })
    return { ok: true }
  })

  // POST /admin/errors/:id/reopen — reabrir error
  fastify.post<{ Params: { id: string } }>('/admin/errors/:id/reopen', async (req, reply) => {
    const { error } = await supabaseAdmin
      .from('error_events')
      .update({ resolved_at: null, resolved_by: null })
      .eq('id', req.params.id)
    if (error) return reply.status(400).send({ error: error.message })
    logFromRequest(req, 'error.reopen', { type: 'error_event', id: req.params.id })
    return { ok: true }
  })

  // DELETE /admin/errors/:id — eliminar definitivamente
  fastify.delete<{ Params: { id: string } }>('/admin/errors/:id', async (req, reply) => {
    const { error } = await supabaseAdmin.from('error_events').delete().eq('id', req.params.id)
    if (error) return reply.status(400).send({ error: error.message })
    logFromRequest(req, 'error.delete', { type: 'error_event', id: req.params.id })
    return { ok: true }
  })

  // ════════════════════════════════════════════════════════
  //  COHORTS · /admin/cohorts
  // ════════════════════════════════════════════════════════
  // Calcula la matriz de retención: para cada mes de signup,
  // qué % de clínicas estaban activas (tuvieron al menos 1 lead)
  // en cada mes posterior.
  fastify.get<{ Querystring: { months?: string } }>('/admin/cohorts', async (req) => {
    const months = Math.min(parseInt(req.query.months ?? '12', 10) || 12, 24)
    const since = new Date()
    since.setMonth(since.getMonth() - months)
    since.setDate(1)
    since.setHours(0, 0, 0, 0)
    const sinceIso = since.toISOString()

    // 1) Tamaños de cada cohorte
    const { data: sizes, error: sizesErr } = await supabaseAdmin
      .from('admin_cohort_sizes')
      .select('*')
      .gte('cohort_month', sinceIso)
      .order('cohort_month', { ascending: true })
    if (sizesErr) throw sizesErr

    // 2) Actividad mensual: actividad agrupada
    const { data: activity, error: actErr } = await supabaseAdmin
      .from('admin_clinic_monthly_activity')
      .select('clinic_id, cohort_month, activity_month')
      .gte('cohort_month', sinceIso)
      .not('activity_month', 'is', null)
    if (actErr) throw actErr

    // Indexar: cohort_month → set de clinic_ids → meses activos
    const cohortActiveByOffset: Record<string, Record<number, Set<string>>> = {}
    for (const row of (activity ?? []) as {
      clinic_id: string
      cohort_month: string
      activity_month: string
    }[]) {
      const cohort = row.cohort_month
      const offset = monthDiff(row.cohort_month, row.activity_month)
      if (offset < 0) continue
      if (!cohortActiveByOffset[cohort]) cohortActiveByOffset[cohort] = {}
      if (!cohortActiveByOffset[cohort][offset]) cohortActiveByOffset[cohort][offset] = new Set()
      cohortActiveByOffset[cohort][offset].add(row.clinic_id)
    }

    // 3) Armar la matriz
    const now = new Date()
    const cohorts = (sizes ?? []).map((s) => {
      const c = s as { cohort_month: string; size: number; active_now: number; paid_now: number }
      const monthsSince = monthDiff(c.cohort_month, now.toISOString())
      const retention: { offset: number; active: number; pct: number }[] = []
      for (let i = 0; i <= monthsSince; i++) {
        const active = cohortActiveByOffset[c.cohort_month]?.[i]?.size ?? 0
        retention.push({
          offset: i,
          active,
          pct: c.size > 0 ? Math.round((active / c.size) * 1000) / 10 : 0,
        })
      }
      return {
        cohort_month: c.cohort_month,
        size: c.size,
        active_now: c.active_now,
        paid_now: c.paid_now,
        retention,
      }
    })

    return { cohorts, max_offset: monthDiff(sinceIso, now.toISOString()) }
  })

  // ====================================================================
  //  E M A I L S  ·  feed + envío manual + verificación de trials
  // ====================================================================

  // ──────────────────────────────────────────────────────────
  //  GET /admin/emails — listado del log con filtros
  // ──────────────────────────────────────────────────────────
  fastify.get<{
    Querystring: {
      kind?: string
      status?: string
      clinic_id?: string
      to?: string
      limit?: string
      offset?: string
    }
  }>('/admin/emails', async (req) => {
    const limit = Math.min(parseInt(req.query.limit ?? '50', 10) || 50, 200)
    const offset = parseInt(req.query.offset ?? '0', 10) || 0

    let q = supabaseAdmin
      .from('email_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (req.query.kind) q = q.eq('kind', req.query.kind)
    if (req.query.status) q = q.eq('status', req.query.status)
    if (req.query.clinic_id) q = q.eq('clinic_id', req.query.clinic_id)
    if (req.query.to) q = q.ilike('to_email', `%${req.query.to}%`)

    const { data, error, count } = await q
    if (error) throw error

    return {
      emails: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    }
  })

  // ──────────────────────────────────────────────────────────
  //  GET /admin/emails/stats — números rápidos para el dashboard
  // ──────────────────────────────────────────────────────────
  fastify.get('/admin/emails/stats', async () => {
    const since24h = new Date(Date.now() - 86_400_000).toISOString()
    const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString()

    const [sent24h, failed24h, sent7d, skipped24h, byKind24h] = await Promise.all([
      supabaseAdmin
        .from('email_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('created_at', since24h),
      supabaseAdmin
        .from('email_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', since24h),
      supabaseAdmin
        .from('email_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('created_at', since7d),
      supabaseAdmin
        .from('email_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'skipped')
        .gte('created_at', since24h),
      supabaseAdmin
        .from('email_log')
        .select('kind')
        .gte('created_at', since24h)
        .limit(2000),
    ])

    const kindCounts: Record<string, number> = {}
    for (const row of (byKind24h.data ?? []) as { kind: string }[]) {
      kindCounts[row.kind] = (kindCounts[row.kind] ?? 0) + 1
    }

    return {
      sent_24h: sent24h.count ?? 0,
      failed_24h: failed24h.count ?? 0,
      skipped_24h: skipped24h.count ?? 0,
      sent_7d: sent7d.count ?? 0,
      by_kind_24h: kindCounts,
    }
  })

  // ──────────────────────────────────────────────────────────
  //  POST /admin/emails/test — envío manual desde el panel
  // ──────────────────────────────────────────────────────────
  const sendTestSchema = z.object({
    to: z.string().email(),
    kind: z.enum([
      'welcome',
      'trial_ending',
      'payment_pending',
      'appointment_confirmation',
      'wa_connected',
      'daily_summary',
      'test',
    ]),
    /** Permite forzar dry-run aunque haya API key (útil para previsualizar). */
    dry_run: z.boolean().optional(),
    /** Datos opcionales para personalizar el preview. */
    owner_name: z.string().optional(),
    clinic_name: z.string().optional(),
  })

  fastify.post('/admin/emails/test', async (req, reply) => {
    const parsed = sendTestSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', issues: parsed.error.issues })
    }

    const { to, kind, dry_run } = parsed.data
    const ownerName = parsed.data.owner_name ?? 'Doctor de prueba'
    const clinicSummary = {
      id: '00000000-0000-0000-0000-000000000000',
      name: parsed.data.clinic_name ?? 'Clínica de prueba',
      slug: 'demo',
      plan: 'pro',
      status: 'active',
      is_beta: true,
      trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    }

    let result
    switch (kind) {
      case 'welcome':
        result = await sendWelcomeEmail(to, {
          ownerName,
          clinic: clinicSummary,
          isBeta: true,
          trialEndsAt: clinicSummary.trial_ends_at,
        })
        break
      case 'trial_ending':
        result = await sendTrialEndingEmail(to, {
          ownerName,
          clinic: clinicSummary,
          trialEndsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
          isBeta: true,
        })
        break
      case 'payment_pending':
        result = await sendPaymentPendingEmail(to, {
          ownerName,
          clinic: clinicSummary,
          amount: 590,
          currency: 'MXN',
          dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
          invoiceNumber: 'CEL-DEMO-001',
        })
        break
      case 'appointment_confirmation':
        result = await sendAppointmentConfirmationEmail(to, {
          patientName: ownerName,
          clinic: { ...clinicSummary, phone: '+52 55 1234 5678', address: 'Av. Reforma 100' },
          scheduledAt: new Date(Date.now() + 36 * 3_600_000).toISOString(),
          treatment: 'Limpieza dental',
          durationMin: 45,
          notes: 'Llega 5 minutos antes',
        })
        break
      case 'wa_connected':
        result = await sendWaConnectedEmail(to, {
          ownerName,
          clinic: clinicSummary,
          phone: '+52 55 1234 5678',
        })
        break
      case 'daily_summary':
        result = await sendDailySummaryEmail(to, {
          ownerName,
          clinic: clinicSummary,
          forDate: new Date(Date.now() - 86_400_000).toISOString(),
          stats: {
            newLeads: 7,
            messagesIn: 42,
            messagesOut: 38,
            appointmentsScheduled: 3,
            appointmentsToday: 2,
          },
          highlights: ['1 paciente preguntó por implantes', '1 cita reagendada'],
        })
        break
      case 'test':
      default:
        result = await sendEmail({
          to,
          kind: 'test',
          rendered: {
            subject: 'Prueba de envío · Celura',
            html: '<p>Si lees esto, Resend está bien configurado. 🌿</p>',
            text: 'Si lees esto, Resend está bien configurado.',
          },
          dryRun: dry_run,
        })
    }

    logFromRequest(req, 'email.test_send', { type: 'email', id: result.id }, {
      to,
      kind,
      status: result.status,
    })

    return reply.send({ success: true, result })
  })

  // ──────────────────────────────────────────────────────────
  //  POST /admin/emails/check-trials — barre clínicas con trial
  //  por vencer y dispara trial_ending. Idempotente: revisa
  //  email_log para no mandar dos veces en el mismo día.
  // ──────────────────────────────────────────────────────────
  fastify.post('/admin/emails/check-trials', async (req, reply) => {
    const WINDOW_DAYS = [3, 1, 0] // recordatorios en T-3, T-1 y T-0
    const now = Date.now()
    const sentCounts: Record<number, number> = {}
    let skipped = 0
    let errors = 0

    for (const days of WINDOW_DAYS) {
      const dayStart = new Date(now + days * 86_400_000)
      dayStart.setUTCHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setUTCHours(23, 59, 59, 999)

      const { data: clinics } = await supabaseAdmin
        .from('clinics')
        .select('id, name, slug, plan, status, owner_id, trial_ends_at, is_beta')
        .gte('trial_ends_at', dayStart.toISOString())
        .lte('trial_ends_at', dayEnd.toISOString())
        .in('status', ['active', 'trial'])
        .limit(500)

      sentCounts[days] = 0

      for (const c of (clinics ?? []) as Array<{
        id: string
        name: string
        slug: string | null
        plan: string | null
        status: string | null
        owner_id: string
        trial_ends_at: string
        is_beta: boolean | null
      }>) {
        // No enviar dos veces el mismo día por el mismo motivo
        const since = new Date(now - 22 * 3_600_000).toISOString()
        const { count: alreadySent } = await supabaseAdmin
          .from('email_log')
          .select('id', { count: 'exact', head: true })
          .eq('clinic_id', c.id)
          .eq('kind', 'trial_ending')
          .in('status', ['sent', 'queued'])
          .gte('created_at', since)

        if ((alreadySent ?? 0) > 0) {
          skipped++
          continue
        }

        // Resolver email del owner
        let email: string | null = null
        let ownerName: string | null = null
        try {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(c.owner_id)
          email = u?.user?.email ?? null
          const meta = (u?.user?.user_metadata ?? {}) as { name?: string; full_name?: string }
          ownerName = meta.name ?? meta.full_name ?? null
        } catch {
          // Sin email, no podemos hacer nada
        }
        if (!email) {
          errors++
          continue
        }

        const result = await sendTrialEndingEmail(email, {
          ownerName,
          clinic: {
            id: c.id,
            name: c.name,
            slug: c.slug,
            plan: c.plan,
            status: c.status,
            trial_ends_at: c.trial_ends_at,
            is_beta: c.is_beta,
          },
          trialEndsAt: c.trial_ends_at,
          isBeta: !!c.is_beta,
        })
        if (result.status === 'sent') sentCounts[days] = (sentCounts[days] ?? 0) + 1
        else if (result.status === 'failed') errors++
      }
    }

    logFromRequest(req, 'email.check_trials', undefined, { sent: sentCounts, skipped, errors })

    return reply.send({
      success: true,
      sent: sentCounts,
      skipped,
      errors,
      windows_days: WINDOW_DAYS,
    })
  })
}

// Helper: diferencia en meses entre dos fechas ISO
function monthDiff(fromIso: string, toIso: string): number {
  const a = new Date(fromIso)
  const b = new Date(toIso)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}
