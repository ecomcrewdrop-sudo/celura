// ============================================================
//  CELURA · Rutas del CRM (leads)
//  GET    /leads          → lista con filtros
//  GET    /leads/:id      → detalle
//  POST   /leads          → alta manual
//  PATCH  /leads/:id      → actualizar
//
//  Todas las queries usan req.supabase (cliente con JWT del
//  usuario) → la RLS de Postgres garantiza el aislamiento por
//  clinic_id sin que tengamos que filtrarlo manualmente.
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'

const STAGES = ['new', 'contacted', 'warm', 'interested', 'scheduled', 'attended', 'recurring', 'lost'] as const
const URGENCIES = ['low', 'medium', 'high', 'emergency'] as const

const listLeadsQuerySchema = z.object({
  stage: z.enum(STAGES).optional(),
  urgency: z.enum(URGENCIES).optional(),
  min_score: z.coerce.number().int().min(0).max(100).optional(),
  // Permitimos letras (con acentos), números, espacio, dígitos y +-@
  // para evitar inyección en el operador .or() de PostgREST.
  search: z
    .string()
    .max(80)
    .regex(/^[\p{L}\p{N}\s@+\-]+$/u, 'caracteres inválidos en búsqueda')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.enum(['score', 'recent', 'oldest']).default('recent'),
})

const createLeadSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(8).max(20),
  email: z.string().email().max(120).optional(),
  city: z.string().min(2).max(80).optional(),
  treatment_interest: z.string().max(200).optional(),
  urgency_level: z.enum(URGENCIES).default('low'),
  source: z.string().max(40).default('manual'),
  notes: z.string().max(2000).optional(),
})

const updateLeadSchema = z.object({
  name: z.string().min(1).max(120).nullable().optional(),
  phone: z.string().min(8).max(20).optional(),
  email: z.string().email().max(120).nullable().optional(),
  city: z.string().min(2).max(80).nullable().optional(),
  stage: z.enum(STAGES).optional(),
  treatment_interest: z.string().max(200).nullable().optional(),
  urgency_level: z.enum(URGENCIES).optional(),
  notes: z.string().max(2000).nullable().optional(),
})

const idParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
})

export default async function leadsRoutes(fastify: FastifyInstance) {
  // ── GET /leads ──────────────────────────────────────────────
  fastify.get('/leads', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = listLeadsQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Filtros inválidos',
        issues: parsed.error.issues,
      })
    }

    const { stage, urgency, min_score, search, limit, offset, order } = parsed.data

    let query = req.supabase.from('leads').select('*', { count: 'exact' })

    if (stage) query = query.eq('stage', stage)
    if (urgency) query = query.eq('urgency_level', urgency)
    if (typeof min_score === 'number') query = query.gte('score', min_score)
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    switch (order) {
      case 'score':
        query = query.order('score', { ascending: false })
        break
      case 'oldest':
        query = query.order('first_contact_at', { ascending: true })
        break
      case 'recent':
      default:
        query = query.order('last_message_at', { ascending: false, nullsFirst: false })
        break
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      req.log.error({ err: error }, 'Error listando leads')
      return reply.status(500).send({ error: 'Error consultando leads' })
    }

    return reply.send({
      leads: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    })
  })

  // ── GET /leads/:id ──────────────────────────────────────────
  fastify.get('/leads/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'ID inválido' })
    }

    const { data, error } = await req.supabase
      .from('leads')
      .select('*')
      .eq('id', params.data.id)
      .maybeSingle()

    if (error) {
      req.log.error({ err: error }, 'Error consultando lead')
      return reply.status(500).send({ error: 'Error consultando lead' })
    }
    if (!data) {
      return reply.status(404).send({ error: 'Lead no encontrado' })
    }

    return reply.send({ lead: data })
  })

  // ── POST /leads ─────────────────────────────────────────────
  fastify.post('/leads', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = createLeadSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Datos inválidos',
        issues: parsed.error.issues,
      })
    }

    const { data, error } = await req.supabase
      .from('leads')
      .insert({
        ...parsed.data,
        clinic_id: req.tenant.clinic_id,
        stage: 'new',
        score: 0,
      })
      .select()
      .single()

    if (error || !data) {
      // 23505 = unique_violation (mismo phone para esta clínica)
      if (error?.code === '23505') {
        return reply.status(409).send({
          error: 'Ya existe un lead con ese teléfono en tu clínica',
        })
      }
      req.log.error({ err: error }, 'Error creando lead')
      return reply.status(500).send({ error: 'Error creando lead' })
    }

    return reply.status(201).send({ success: true, lead: data })
  })

  // ── PATCH /leads/:id ────────────────────────────────────────
  fastify.patch('/leads/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'ID inválido' })
    }

    const parsed = updateLeadSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Datos inválidos',
        issues: parsed.error.issues,
      })
    }

    if (Object.keys(parsed.data).length === 0) {
      return reply.status(400).send({ error: 'Nada que actualizar' })
    }

    const { data, error } = await req.supabase
      .from('leads')
      .update(parsed.data)
      .eq('id', params.data.id)
      .select()
      .maybeSingle()

    if (error) {
      req.log.error({ err: error }, 'Error actualizando lead')
      return reply.status(500).send({ error: 'Error actualizando lead' })
    }
    if (!data) {
      // RLS bloqueó la fila o no existe — no revelamos cuál de los dos
      return reply.status(404).send({ error: 'Lead no encontrado' })
    }

    return reply.send({ success: true, lead: data })
  })
}
