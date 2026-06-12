// ============================================================
//  CELURA · Rutas de clínica
//  GET   /clinics/me           → datos de la clínica + config (keys enmascaradas)
//  PATCH /clinics/me           → actualiza datos básicos de la clínica (perfil)
//  PATCH /clinics/me/config    → actualiza configuración (encripta keys si vienen)
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { encrypt, decrypt, maskApiKey } from '../services/crypto.js'

const scheduleStringRegex = /^(\d{2}:\d{2}-\d{2}:\d{2})$/
const hhmmRegex = /^([01]\d|2[0-3]):[0-5]\d$/

// Zod schema para FollowUpConfig — TODO opcional para que el frontend pueda
// mandar solo el subset que cambió. El backend hace merge contra el actual.
const followupConfigSchema = z.object({
  appointment_reminders: z.object({
    h24_enabled: z.boolean(),
    h2_enabled: z.boolean(),
    h2_minutes_before: z.number().int().min(15).max(240),
    post_visit_enabled: z.boolean(),
    post_visit_minutes_after: z.number().int().min(15).max(240),
    review_request_enabled: z.boolean(),
    review_request_hours_after: z.number().int().min(6).max(72),
  }).partial().optional(),
  cold_followups: z.object({
    d7_enabled:  z.boolean(),
    d7_days:     z.number().int().min(1).max(21),
    d14_enabled: z.boolean(),
    d14_days:    z.number().int().min(7).max(30),
    d30_enabled: z.boolean(),
    d30_days:    z.number().int().min(15).max(90),
  }).partial().optional(),
  reactivation: z.object({
    enabled: z.boolean(),
    months_inactive: z.number().int().min(1).max(12),
  }).partial().optional(),
  ai_generated: z.boolean().optional(),
  quiet_hours: z.object({
    enabled: z.boolean(),
    from: z.string().regex(hhmmRegex),
    to: z.string().regex(hhmmRegex),
  }).partial().optional(),
  templates: z.object({
    pre_appt_24h:      z.string().max(400),
    pre_appt_2h:       z.string().max(400),
    post_appt_1h:      z.string().max(400),
    post_appt_review:  z.string().max(400),
    cold_7d:           z.string().max(400),
    cold_14d:          z.string().max(400),
    cold_30d:          z.string().max(400),
    reactivation:      z.string().max(400),
  }).partial().optional(),
}).partial()

// ── Perfil de la clínica (datos editables desde el menú de usuario) ──
const updateClinicSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  phone: z.string().min(6).max(30).nullable().optional(),
  city: z.string().min(1).max(80).nullable().optional(),
  country: z.string().min(2).max(3).optional(),
})

const updateConfigSchema = z.object({
  assistant_name: z.string().min(1).max(60).optional(),
  tone: z.enum(['formal', 'warm', 'direct']).optional(),
  greeting: z.string().max(500).optional(),
  farewell: z.string().max(500).optional(),
  treatments: z.array(z.string().min(1).max(80)).max(50).optional(),
  schedule: z
    .object({
      mon: z.string().regex(scheduleStringRegex).nullable(),
      tue: z.string().regex(scheduleStringRegex).nullable(),
      wed: z.string().regex(scheduleStringRegex).nullable(),
      thu: z.string().regex(scheduleStringRegex).nullable(),
      fri: z.string().regex(scheduleStringRegex).nullable(),
      sat: z.string().regex(scheduleStringRegex).nullable(),
      sun: z.string().regex(scheduleStringRegex).nullable(),
    })
    .partial()
    .optional(),
  custom_prompt: z.string().max(2000).optional(),
  escalate_on: z.array(z.string().min(1).max(80)).max(30).optional(),
  // Análisis clínico de imágenes (Claude Vision)
  vision_enabled: z.boolean().optional(),
  vision_sensitivity: z.enum(['conservative', 'balanced', 'thorough']).optional(),
  vision_focus: z.array(z.string().min(1).max(40)).max(20).optional(),
  vision_auto_suggest: z.boolean().optional(),
  vision_disclaimer: z.string().max(500).optional(),
  // Proveedor de IA: claude (Anthropic) | openai (ChatGPT)
  ai_provider: z.enum(['claude', 'openai']).optional(),
  // Claves en texto plano: las encriptamos antes de guardar
  claude_api_key: z.string().min(20).max(200).optional(),
  openai_api_key: z.string().min(20).max(200).optional(),
  elevenlabs_api_key: z.string().min(20).max(200).optional(),
  // Seguimientos y recordatorios (jsonb single column)
  followup_config: followupConfigSchema.optional(),
})

function safeMask(enc: string | null): string | null {
  if (!enc) return null
  try {
    return maskApiKey(decrypt(enc))
  } catch {
    return '••••••••'
  }
}

export default async function clinicsRoutes(fastify: FastifyInstance) {
  // ── GET /clinics/me ─────────────────────────────────────────
  fastify.get('/clinics/me', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clinic, config } = req.tenant

    // Nunca devolver las versiones encriptadas crudas
    const { claude_key_enc, openai_key_enc, elevenlabs_key_enc, ...safeConfig } = config

    return reply.send({
      clinic,
      config: {
        ...safeConfig,
        claude_api_key_masked: safeMask(claude_key_enc),
        openai_api_key_masked: safeMask(openai_key_enc),
        elevenlabs_api_key_masked: safeMask(elevenlabs_key_enc),
        has_claude_key: !!claude_key_enc,
        has_openai_key: !!openai_key_enc,
        has_elevenlabs_key: !!elevenlabs_key_enc,
      },
    })
  })

  // ── PATCH /clinics/me ───────────────────────────────────────
  // Actualiza datos del perfil de la clínica (nombre, ciudad, teléfono, país).
  fastify.patch('/clinics/me', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = updateClinicSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Datos inválidos',
        issues: parsed.error.issues,
      })
    }

    const updates = parsed.data
    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'Nada que actualizar' })
    }

    const { data, error } = await req.supabase
      .from('clinics')
      .update(updates)
      .eq('id', req.tenant.clinic_id)
      .select()
      .single()

    if (error || !data) {
      req.log.error({ err: error }, 'Error actualizando clínica')
      return reply.status(500).send({ error: 'No se pudo actualizar el perfil' })
    }

    fastify.invalidateTenantCache(req.tenant.owner_id)

    return reply.send({
      success: true,
      message: 'Perfil actualizado',
      clinic: data,
    })
  })

  // ── PATCH /clinics/me/config ────────────────────────────────
  fastify.patch('/clinics/me/config', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = updateConfigSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Datos inválidos',
        issues: parsed.error.issues,
      })
    }

    const { claude_api_key, openai_api_key, elevenlabs_api_key, followup_config: incomingFollowup, ...rest } = parsed.data
    const updates: Record<string, unknown> = { ...rest }

    if (claude_api_key) {
      updates['claude_key_enc'] = encrypt(claude_api_key)
    }
    if (openai_api_key) {
      updates['openai_key_enc'] = encrypt(openai_api_key)
    }
    if (elevenlabs_api_key) {
      updates['elevenlabs_key_enc'] = encrypt(elevenlabs_api_key)
    }

    // Merge profundo de followup_config: el frontend manda solo lo que cambió.
    // Cargamos el valor actual de la BD y hacemos merge por sub-objeto.
    if (incomingFollowup) {
      const { data: currentRow } = await req.supabase
        .from('clinic_config')
        .select('followup_config')
        .eq('clinic_id', req.tenant.clinic_id)
        .single<{ followup_config: Record<string, Record<string, unknown>> | null }>()
      const current = currentRow?.followup_config ?? {}
      const merged: Record<string, unknown> = { ...current }
      for (const [k, v] of Object.entries(incomingFollowup)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          merged[k] = { ...(current[k] ?? {}), ...v }
        } else {
          merged[k] = v
        }
      }
      updates['followup_config'] = merged
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'Nada que actualizar' })
    }

    const { data, error } = await req.supabase
      .from('clinic_config')
      .update(updates)
      .eq('clinic_id', req.tenant.clinic_id)
      .select()
      .single()

    if (error || !data) {
      req.log.error({ err: error }, 'Error actualizando config')
      return reply.status(500).send({ error: 'Error actualizando configuración' })
    }

    // Invalidar cache del tenant para que los próximos requests vean lo nuevo
    fastify.invalidateTenantCache(req.tenant.owner_id)

    return reply.send({
      success: true,
      message: 'Configuración actualizada',
    })
  })

  // ── POST /clinics/me/redeem-promo ──────────────────────────
  // El doctor ingresa un código (cupón, extensión de trial, código de
  // afiliado). Se valida y aplica vía RPC atómica en Supabase.
  fastify.post(
    '/clinics/me/redeem-promo',
    async (req: FastifyRequest<{ Body: { code?: string } }>, reply: FastifyReply) => {
      const code = (req.body?.code ?? '').trim()
      if (code.length < 3 || code.length > 50) {
        return reply.status(400).send({ error: 'Código inválido' })
      }

      const { data, error } = await req.supabase.rpc('redeem_promo_code', {
        p_code: code,
        p_clinic_id: req.tenant.clinic_id,
      })

      if (error) {
        req.log.warn({ err: error.message }, 'Error al redimir promo')
        return reply.status(400).send({ error: 'No se pudo procesar el código' })
      }

      const result = data as { ok: boolean; error?: string; code?: string; result?: unknown }
      if (!result?.ok) {
        return reply.status(400).send({ error: result?.error ?? 'Código no válido' })
      }

      // Invalidar cache del tenant si la promo cambió el plan o el trial
      fastify.invalidateTenantCache(req.tenant.owner_id)

      return reply.send(result)
    },
  )
}
