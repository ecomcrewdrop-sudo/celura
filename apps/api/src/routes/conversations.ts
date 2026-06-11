// ============================================================
//  CELURA · Rutas de conversaciones (historial WhatsApp)
//  GET  /leads/:id/conversation  → historial completo del lead
//  GET  /conversations           → lista de últimas conversaciones
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { sendMessage } from '../services/whatsapp.js'
import type { Message, ConversationContext } from '../types/tenant.js'

const idParam = z.object({ id: z.string().uuid('ID inválido') })

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(80).optional(),
  stage: z.enum(['new', 'contacted', 'warm', 'interested', 'scheduled', 'attended', 'recurring', 'lost']).optional(),
  escalated: z.coerce.boolean().optional(),
})

const sendSchema = z.object({
  text: z.string().trim().min(1).max(2000),
})

const updateLeadSchema = z.object({
  stage: z.enum(['new', 'contacted', 'warm', 'interested', 'scheduled', 'attended', 'recurring', 'lost']).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  treatment_interest: z.string().trim().max(80).nullable().optional(),
  urgency_level: z.enum(['low', 'medium', 'high', 'emergency']).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

const markReadSchema = z.object({
  read: z.boolean().default(true),
})

interface ConversationRow {
  id: string
  clinic_id: string
  lead_id: string
  messages: Message[]
  context: ConversationContext
  total_tokens: number
  created_at: string
  updated_at: string
}

export default async function conversationsRoutes(fastify: FastifyInstance) {
  // ── GET /leads/:id/conversation ─────────────────────────────
  // Devuelve la conversación completa de un lead específico.
  // Si el lead nunca escribió por WA, devuelve un payload vacío
  // en vez de 404 para que el frontend renderice un estado nice.
  fastify.get('/leads/:id/conversation', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = idParam.safeParse(req.params)
    if (!p.success) return reply.status(400).send({ error: 'ID inválido' })

    // RLS filtra por clinic_id automáticamente
    const { data: lead, error: leadErr } = await req.supabase
      .from('leads')
      .select(
        'id, name, phone, stage, score, urgency_level, treatment_interest, notes, first_contact_at, last_message_at, source',
      )
      .eq('id', p.data.id)
      .maybeSingle()

    if (leadErr) return reply.status(500).send({ error: 'Error consultando lead' })
    if (!lead) return reply.status(404).send({ error: 'Lead no encontrado' })

    const { data: convo, error: convoErr } = await req.supabase
      .from('conversations')
      .select('*')
      .eq('lead_id', p.data.id)
      .maybeSingle<ConversationRow>()

    if (convoErr) {
      req.log.error({ err: convoErr }, 'Error consultando conversación')
      return reply.status(500).send({ error: 'Error consultando conversación' })
    }

    return reply.send({
      lead,
      conversation: convo
        ? {
            id: convo.id,
            messages: convo.messages ?? [],
            context: convo.context ?? {},
            total_tokens: convo.total_tokens ?? 0,
            updated_at: convo.updated_at,
          }
        : {
            id: null,
            messages: [],
            context: {},
            total_tokens: 0,
            updated_at: null,
          },
    })
  })

  // ── GET /conversations ──────────────────────────────────────
  // Lista paginada con filtros: search (nombre/teléfono), stage, escalated.
  // Si WhatsApp no está conectado, devuelve vacío (el panel debe verse limpio).
  fastify.get('/conversations', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = listSchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Filtros inválidos', issues: parsed.error.issues })
    }
    const { limit, offset, search, stage, escalated } = parsed.data

    // WhatsApp desconectado → no mostrar conversaciones
    if (!req.tenant.config.wa_connected) {
      return reply.send({ conversations: [], total: 0, limit, offset, wa_connected: false })
    }

    // Si filtran por nombre/teléfono o stage, primero buscamos leads que matchean
    // para hacer el filtro a través del FK lead_id.
    let leadIdsFilter: string[] | null = null
    if (search || stage) {
      let leadsQuery = req.supabase
        .from('leads')
        .select('id')
        .eq('clinic_id', req.tenant.clinic_id)

      if (stage) leadsQuery = leadsQuery.eq('stage', stage)
      if (search) {
        const term = `%${search}%`
        leadsQuery = leadsQuery.or(`name.ilike.${term},phone.ilike.${term}`)
      }

      const { data: leads, error: leadsErr } = await leadsQuery
      if (leadsErr) {
        req.log.error({ err: leadsErr }, 'Error buscando leads para filtros')
        return reply.status(500).send({ error: 'Error buscando leads' })
      }
      leadIdsFilter = (leads ?? []).map((l) => l.id)
      if (leadIdsFilter.length === 0) {
        return reply.send({ conversations: [], total: 0, limit, offset, wa_connected: true })
      }
    }

    let query = req.supabase
      .from('conversations')
      .select(
        'id, lead_id, total_tokens, messages, context, updated_at, leads(id, name, phone, stage, score, urgency_level, treatment_interest, last_message_at)',
        { count: 'exact' },
      )
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (leadIdsFilter) query = query.in('lead_id', leadIdsFilter)
    if (escalated !== undefined) {
      query = escalated
        ? query.eq('context->>escalated', 'true')
        : query.or('context->>escalated.is.null,context->>escalated.eq.false')
    }

    const { data, error, count } = await query

    if (error) {
      req.log.error({ err: error }, 'Error listando conversaciones')
      return reply.status(500).send({ error: 'Error consultando conversaciones' })
    }

    // Construir resumen ligero: último mensaje + flags. NO devolvemos messages crudo
    // al frontend en la lista para no inflar el payload.
    type Row = {
      id: string
      lead_id: string
      total_tokens: number
      updated_at: string
      messages: Message[] | null
      context: ConversationContext | null
      leads: unknown
    }
    const conversations = (data ?? []).map((row) => {
      const r = row as Row
      const msgs = r.messages ?? []
      const last = msgs.length ? msgs[msgs.length - 1]! : null
      const ctx = r.context ?? {}
      return {
        id: r.id,
        lead_id: r.lead_id,
        total_tokens: r.total_tokens,
        updated_at: r.updated_at,
        leads: r.leads,
        last_message: last
          ? {
              role: last.role,
              content: last.content.slice(0, 140),
              timestamp: last.timestamp,
              type: last.type,
            }
          : null,
        message_count: msgs.length,
        escalated: !!ctx.escalated,
        last_intent: ctx.last_intent ?? null,
        has_vision: !!ctx.vision_history?.length,
      }
    })

    return reply.send({
      conversations,
      total: count ?? 0,
      limit,
      offset,
      wa_connected: true,
    })
  })

  // ── POST /leads/:id/messages ───────────────────────────────
  // Enviar mensaje manual desde el panel. Se manda por WhatsApp con el socket
  // de la clínica y se persiste como assistant en la conversación.
  fastify.post('/leads/:id/messages', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = idParam.safeParse(req.params)
    if (!p.success) return reply.status(400).send({ error: 'ID inválido' })

    const body = sendSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Mensaje inválido', issues: body.error.issues })
    }

    if (!req.tenant.config.wa_connected) {
      return reply.status(400).send({ error: 'WhatsApp no está conectado' })
    }

    const { data: lead } = await req.supabase
      .from('leads')
      .select('id, phone')
      .eq('id', p.data.id)
      .maybeSingle<{ id: string; phone: string }>()

    if (!lead) return reply.status(404).send({ error: 'Lead no encontrado' })

    const sent = await sendMessage(req.tenant.clinic_id, lead.phone, body.data.text)
    if (!sent) {
      return reply.status(502).send({ error: 'No se pudo enviar el mensaje a WhatsApp' })
    }

    // Persistir en la conversación
    const { data: convo } = await req.supabase
      .from('conversations')
      .select('id, messages, context')
      .eq('lead_id', lead.id)
      .maybeSingle<{ id: string; messages: Message[]; context: ConversationContext }>()

    const newMsg: Message & { source?: string; manual?: boolean } = {
      role: 'assistant',
      content: body.data.text,
      timestamp: new Date().toISOString(),
      type: 'text',
      source: 'outgoing',
      manual: true,
    }

    if (convo) {
      await req.supabase
        .from('conversations')
        .update({
          messages: [...(convo.messages ?? []), newMsg],
          // Al responder manualmente, desescalamos: el doctor ya atendió.
          context: { ...(convo.context ?? {}), escalated: false },
        })
        .eq('id', convo.id)
    } else {
      await req.supabase.from('conversations').insert({
        clinic_id: req.tenant.clinic_id,
        lead_id: lead.id,
        messages: [newMsg],
        context: {},
      })
    }

    await req.supabase
      .from('leads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', lead.id)

    return reply.send({ success: true, message: newMsg })
  })

  // ── PATCH /leads/:id ───────────────────────────────────────
  // Actualiza datos del lead desde el panel (stage, name, urgency, notes).
  fastify.patch('/leads/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = idParam.safeParse(req.params)
    if (!p.success) return reply.status(400).send({ error: 'ID inválido' })

    const body = updateLeadSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Datos inválidos', issues: body.error.issues })
    }
    if (Object.keys(body.data).length === 0) {
      return reply.status(400).send({ error: 'Nada que actualizar' })
    }

    const { data, error } = await req.supabase
      .from('leads')
      .update(body.data as Record<string, unknown>)
      .eq('id', p.data.id)
      .select()
      .maybeSingle()

    if (error || !data) {
      req.log.error({ err: error }, 'Error actualizando lead')
      return reply.status(500).send({ error: 'Error actualizando lead' })
    }
    return reply.send({ lead: data })
  })

  // ── POST /leads/:id/conversation/read ──────────────────────
  // Marca la conversación como leída/no leída por el doctor.
  fastify.post('/leads/:id/conversation/read', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = idParam.safeParse(req.params)
    if (!p.success) return reply.status(400).send({ error: 'ID inválido' })

    const body = markReadSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Datos inválidos' })
    }

    const { data: convo } = await req.supabase
      .from('conversations')
      .select('id, context')
      .eq('lead_id', p.data.id)
      .maybeSingle<{ id: string; context: ConversationContext }>()

    if (!convo) return reply.status(404).send({ error: 'Conversación no encontrada' })

    const newCtx = body.data.read
      ? { ...(convo.context ?? {}), read_at: new Date().toISOString() }
      : { ...(convo.context ?? {}), read_at: null }

    await req.supabase.from('conversations').update({ context: newCtx }).eq('id', convo.id)

    return reply.send({ success: true })
  })
}