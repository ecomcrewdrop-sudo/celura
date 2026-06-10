// ============================================================
//  CELURA · Rutas de onboarding
//  POST /onboarding/clinic → crear clínica para el usuario auth
//
//  Estas rutas son "públicas" desde el tenant plugin (no hay
//  clínica que cargar todavía), pero validan JWT por dentro.
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'

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
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS)

    const { data: clinic, error: clinicError } = await admin
      .from('clinics')
      .insert({
        owner_id: userId,
        name: parsed.data.name,
        slug: parsed.data.slug,
        phone: parsed.data.phone ?? null,
        city: parsed.data.city ?? null,
        country: parsed.data.country,
        plan: 'trial',
        status: 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
      })
      .select()
      .single()

    if (clinicError || !clinic) {
      req.log.error({ err: clinicError }, 'Error creando clínica')
      return reply.status(500).send({ error: 'Error creando clínica' })
    }

    return reply.status(201).send({
      success: true,
      clinic,
      trial_ends_at: trialEndsAt.toISOString(),
      message: `Bienvenido a Celura. Tu trial termina el ${trialEndsAt.toISOString().slice(0, 10)}.`,
    })
  })
}
