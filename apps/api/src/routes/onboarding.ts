// ============================================================
//  CELURA · Rutas de onboarding
//  POST /onboarding/clinic → crear clínica para el usuario auth
//
//  Estas rutas son "públicas" desde el tenant plugin (no hay
//  clínica que cargar todavía), pero validan JWT por dentro.
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { sendWelcomeEmail } from '../services/email/index.js'

const createClinicSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'slug solo letras minúsculas, números y guiones'),
  phone: z.string().min(8).max(20).optional(),
  city: z.string().min(2).max(80).optional(),
  country: z.string().length(2).default('MX'),
})

const TRIAL_DAYS = 14
const BETA_DAYS = 14

function isBetaMode(): boolean {
  return (process.env.BETA_MODE ?? 'true').toLowerCase() === 'true'
}

export default async function onboardingRoutes(fastify: FastifyInstance) {
  fastify.post('/onboarding/clinic', async (req: FastifyRequest, reply: FastifyReply) => {
    // 1. Verificar JWT manualmente (el tenant plugin no corre acá)
    let payload: { sub?: string; email?: string }
    try {
      payload = await req.jwtVerify<{ sub?: string; email?: string }>()
    } catch {
      return reply.status(401).send({ error: 'Token inválido o expirado' })
    }

    const userId = payload.sub
    if (!userId) {
      return reply.status(401).send({ error: 'Token sin usuario' })
    }

    // 2. Validar body
    const parsed = createClinicSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Datos inválidos',
        issues: parsed.error.issues,
      })
    }

    const admin = fastify.supabaseAdmin

    // 3. Verificar que el usuario aún no tenga clínica
    const { data: existing } = await admin
      .from('clinics')
      .select('id')
      .eq('owner_id', userId)
      .maybeSingle()

    if (existing) {
      return reply.status(409).send({
        error: 'Ya tienes una clínica registrada',
        clinic_id: existing.id,
      })
    }

    // 4. Verificar slug único
    const { data: slugTaken } = await admin
      .from('clinics')
      .select('id')
      .eq('slug', parsed.data.slug)
      .maybeSingle()

    if (slugTaken) {
      return reply.status(409).send({
        error: 'Ese identificador (slug) ya está en uso',
      })
    }

    // 5. Crear la clínica (el trigger create_clinic_config genera la config)
    //    Durante BETA_MODE los usuarios reciben plan PRO 14 días automático.
    const beta = isBetaMode()
    const days = beta ? BETA_DAYS : TRIAL_DAYS
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + days)

    const { data: clinic, error: clinicError } = await admin
      .from('clinics')
      .insert({
        owner_id: userId,
        name: parsed.data.name,
        slug: parsed.data.slug,
        phone: parsed.data.phone ?? null,
        city: parsed.data.city ?? null,
        country: parsed.data.country,
        plan: beta ? 'pro' : 'trial',
        status: beta ? 'active' : 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
        is_beta: beta,
        beta_started_at: beta ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (clinicError || !clinic) {
      req.log.error({ err: clinicError }, 'Error creando clínica')
      return reply.status(500).send({ error: 'Error creando clínica' })
    }

    // 6. Enviar email de bienvenida (fire-and-forget — el mailer nunca lanza,
    //    pero igual lo metemos en try para no romper la respuesta si algo
    //    explota en la resolución del owner).
    try {
      // El JWT trae el email del usuario auth; si no, lo buscamos en admin.users.
      let ownerEmail = payload.email ?? null
      let ownerName: string | null = null
      if (!ownerEmail || !ownerEmail.includes('@')) {
        const { data: authUser } = await admin.auth.admin.getUserById(userId)
        ownerEmail = authUser?.user?.email ?? null
        const meta = (authUser?.user?.user_metadata ?? {}) as { name?: string; full_name?: string }
        ownerName = meta.name ?? meta.full_name ?? null
      }

      if (ownerEmail) {
        void sendWelcomeEmail(ownerEmail, {
          ownerName,
          clinic: {
            id: clinic.id,
            name: clinic.name,
            slug: clinic.slug,
            plan: clinic.plan,
            status: clinic.status,
            is_beta: clinic.is_beta,
            trial_ends_at: clinic.trial_ends_at,
          },
          isBeta: beta,
          trialEndsAt: trialEndsAt.toISOString(),
        }).catch((err) => {
          req.log.warn({ err }, 'Welcome email falló (no bloquea onboarding)')
        })
      }
    } catch (err) {
      req.log.warn({ err }, 'No se pudo enviar el welcome email')
    }

    return reply.status(201).send({
      success: true,
      clinic,
      trial_ends_at: trialEndsAt.toISOString(),
      is_beta: beta,
      plan: beta ? 'pro' : 'trial',
      message: beta
        ? `Bienvenido al programa beta de Celura. Tienes plan PRO hasta el ${trialEndsAt.toISOString().slice(0, 10)}.`
        : `Bienvenido a Celura. Tu trial termina el ${trialEndsAt.toISOString().slice(0, 10)}.`,
    })
  })

  // ── Config pública (sin auth) para que el frontend sepa
  //    si estamos en periodo beta y muestre el banner.
  fastify.get('/auth/config', async () => {
    return {
      beta_mode: isBetaMode(),
      beta_days: BETA_DAYS,
      trial_days: TRIAL_DAYS,
    }
  })
}
