// ============================================================
//  CELURA · Rutas de conversaciones (historial WhatsApp)
//  GET  /leads/:id/conversation  → historial completo del lead
//  GET  /conversations           → lista de últimas conversaciones
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { Message, ConversationContext } from '../types/tenant.js'

const idParam = z.object({ id: z.string().uuid('ID inválido') })

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
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
      .select('id, name, phone, stage, score')
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
  // Listado paginado de conversaciones (las más recientes primero).
  // Incluye el lead embebido para mostrar quién es sin un join extra.
  fastify.get('/conversations', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = listSchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Filtros inválidos', issues: parsed.error.issues })
    }
    const { limit, offset } = parsed.data

    const { data, error, count } = await req.supabase
      .from('conversations')
      .select('id, lead_id, total_tokens, updated_at, leads(id, name, phone, stage, score)', {
        count: 'exact',
      })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      req.log.error({ err: error }, 'Error listando conversaciones')
      return reply.status(500).send({ error: 'Error consultando conversaciones' })
    }

    return reply.send({
      conversations: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    })
  })
}
