// ============================================================
//  CELURA · Plugin de aislamiento por tenant
//  Este plugin es la primera línea de defensa.
//  Todo request autenticado pasa por aquí.
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { TenantContext, Clinic, ClinicConfig } from '../types/tenant.js'

// Cache en memoria: evita ir a DB en cada request
// clinic_id → { context, cached_at }
const tenantCache = new Map<string, { ctx: TenantContext; at: number }>()
const CACHE_TTL_MS = 60_000 // 1 minuto

// Extender FastifyRequest con el contexto del tenant
declare module 'fastify' {
  interface FastifyRequest {
    tenant: TenantContext
    supabase: SupabaseClient  // cliente con el JWT del usuario (respeta RLS)
  }
  interface FastifyInstance {
    supabaseAdmin: SupabaseClient
    invalidateTenantCache: (userId: string) => void
  }
}

async function tenantPlugin(fastify: FastifyInstance) {
  // ── Supabase admin (sin RLS, solo para operaciones internas) ──
  const adminClient = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } }
  )

  // ── Decorar fastify con el admin client ──
  fastify.decorate('supabaseAdmin', adminClient)

  // ── Hook: corre en cada request a rutas protegidas ──
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Rutas públicas: skip
    // Las rutas /onboarding/* verifican el JWT por dentro pero
    // saltan la carga de clínica (porque aún no existe).
    const publicPaths = [
      '/health',
      '/auth/login',
      '/auth/register',
      '/auth/config',
      '/onboarding/',
    ]
    if (publicPaths.some(p => request.url.startsWith(p))) return

    // 1. Verificar JWT
    let payload: { sub: string; clinic_id?: string }
    try {
      payload = await request.jwtVerify<{ sub: string; clinic_id?: string }>()
    } catch {
      return reply.status(401).send({ error: 'Token inválido o expirado' })
    }

    const userId = payload.sub
    if (!userId) {
      return reply.status(401).send({ error: 'Token sin usuario' })
    }

    // 2. Buscar clinic_id asociado a este usuario
    // (el usuario puede tener solo UNA clínica por ahora)
    const cacheKey = userId

    // ── Cache hit ──
    const cached = tenantCache.get(cacheKey)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      request.tenant = cached.ctx
      // Crear cliente Supabase con el JWT del usuario (respeta RLS)
      request.supabase = createClient(
        process.env['SUPABASE_URL']!,
        process.env['SUPABASE_ANON_KEY']!,
        {
          global: { headers: { Authorization: `Bearer ${request.headers.authorization?.split(' ')[1]}` } },
          auth: { persistSession: false },
        }
      )
      return
    }

    // ── Cache miss: ir a DB ──
    const { data: clinic, error: clinicError } = await adminClient
      .from('clinics')
      .select('*')
      .eq('owner_id', userId)
      .single<Clinic>()

    if (clinicError || !clinic) {
      return reply.status(403).send({
        error: 'Clínica no encontrada. Completa el onboarding primero.',
      })
    }

    // 3. Verificar que la clínica esté activa
    if (clinic.status === 'suspended') {
      return reply.status(403).send({
        error: 'Tu cuenta está suspendida. Contacta soporte: hola@celura.clinic',
      })
    }

    if (clinic.status === 'cancelled') {
      return reply.status(403).send({
        error: 'Tu suscripción fue cancelada. Reactiva en celura.clinic',
      })
    }

    // 4. Verificar trial no expirado
    if (clinic.plan === 'trial' && clinic.trial_ends_at) {
      const trialEnd = new Date(clinic.trial_ends_at)
      if (trialEnd < new Date()) {
        return reply.status(402).send({
          error: 'Tu período de prueba expiró. Elige un plan en celura.clinic',
          code: 'TRIAL_EXPIRED',
        })
      }
    }

    // 5. Cargar configuración del asistente
    const { data: config, error: configError } = await adminClient
      .from('clinic_config')
      .select('*')
      .eq('clinic_id', clinic.id)
      .single<ClinicConfig>()

    if (configError || !config) {
      // Si no existe la config, crearla (edge case en onboarding)
      const { data: newConfig } = await adminClient
        .from('clinic_config')
        .insert({ clinic_id: clinic.id })
        .select()
        .single<ClinicConfig>()

      if (!newConfig) {
        return reply.status(500).send({ error: 'Error cargando configuración' })
      }

      const ctx: TenantContext = {
        clinic_id: clinic.id,
        owner_id: userId,
        clinic,
        config: newConfig,
        plan: clinic.plan,
      }
      tenantCache.set(cacheKey, { ctx, at: Date.now() })
      request.tenant = ctx
    } else {
      const ctx: TenantContext = {
        clinic_id: clinic.id,
        owner_id: userId,
        clinic,
        config,
        plan: clinic.plan,
      }
      tenantCache.set(cacheKey, { ctx, at: Date.now() })
      request.tenant = ctx
    }

    // 6. Cliente Supabase con JWT del usuario (respeta RLS automáticamente)
    const token = request.headers.authorization?.split(' ')[1]
    request.supabase = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_ANON_KEY']!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      }
    )
  })

  // ── Limpiar cache cuando se actualiza una clínica ──
  fastify.decorate('invalidateTenantCache', (userId: string) => {
    tenantCache.delete(userId)
  })
}

export default fp(tenantPlugin, {
  name: 'tenant',
  dependencies: ['@fastify/jwt'],
})
