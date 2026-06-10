// ============================================================
//  CELURA · Rutas de clínica
//  GET   /clinics/me           → datos de la clínica + config (keys enmascaradas)
//  PATCH /clinics/me/config    → actualiza configuración (encripta keys si vienen)
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { encrypt, decrypt, maskApiKey } from '../services/crypto.js'

const scheduleStringRegex = /^(\d{2}:\d{2}-\d{2}:\d{2})$/

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
  // Claves en texto plano: las encriptamos antes de guardar
  claude_api_key: z.string().min(20).max(200).optional(),
  elevenlabs_api_key: z.string().min(20).max(200).optional(),
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
    const { claude_key_enc, elevenlabs_key_enc, ...safeConfig } = config

    return reply.send({
      clinic,
      config: {
        ...safeConfig,
        claude_api_key_masked: safeMask(claude_key_enc),
        elevenlabs_api_key_masked: safeMask(elevenlabs_key_enc),
        has_claude_key: !!claude_key_enc,
        has_elevenlabs_key: !!elevenlabs_key_enc,
      },
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

    const { claude_api_key, elevenlabs_api_key, ...rest } = parsed.data
    const updates: Record<string, unknown> = { ...rest }

    if (claude_api_key) {
      updates['claude_key_enc'] = encrypt(claude_api_key)
    }
    if (elevenlabs_api_key) {
      updates['elevenlabs_key_enc'] = encrypt(elevenlabs_api_key)
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
}
