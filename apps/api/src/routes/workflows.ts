// ============================================================
//  CELURA · Rutas de workflows
//  GET    /workflows         → lista de la clínica
//  GET    /workflows/:id     → detalle
//  POST   /workflows         → crear
//  PATCH  /workflows/:id     → actualizar (nombre, enabled, priority, graph)
//  DELETE /workflows/:id     → eliminar
//
//  El graph se valida con Zod antes de persistir. Eso garantiza
//  que el engine nunca vea un workflow malformado en runtime.
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'

const TRIGGER_TYPES = [
  'message_received',
  'new_patient',
  'keyword_match',
  'intent_detected',
  'photo_received',
  'urgency_level',
  'lead_score_above',
] as const

const CONDITION_TYPES = [
  'is_business_hours',
  'has_appointment',
  'urgency_is',
  'score_above',
  'stage_is',
  'message_contains',
  'name_known',
  'photo_finding',
] as const

const ACTION_TYPES = [
  'send_message',
  'ai_respond',
  'ask_qualifying',
  'request_photo',
  'analyze_photo',
  'offer_appointment',
  'quote_price',
  'escalate_to_human',
  'set_stage',
  'set_urgency',
  'schedule_followup',
  'tag_lead',
  'end_workflow',
] as const

const triggerSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(TRIGGER_TYPES),
  params: z.record(z.unknown()).default({}),
  next: z.string().min(1).max(40).nullable(),
})

const conditionBlockSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.literal('condition'),
  type: z.enum(CONDITION_TYPES),
  params: z.record(z.unknown()).default({}),
  next: z.string().min(1).max(40).nullable(),
  next_else: z.string().min(1).max(40).nullable(),
})

const actionBlockSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.literal('action'),
  type: z.enum(ACTION_TYPES),
  params: z.record(z.unknown()).default({}),
  next: z.string().min(1).max(40).nullable(),
})

const blockSchema = z.discriminatedUnion('kind', [conditionBlockSchema, actionBlockSchema])

const graphSchema = z.object({
  trigger: triggerSchema.nullable(),
  blocks: z.record(blockSchema).default({}),
})

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(280).default(''),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(10),
  graph: graphSchema.default({ trigger: null, blocks: {} }),
})

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(280).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  graph: graphSchema.optional(),
})

// ── Validación lógica del grafo: detecta huérfanos y ciclos infinitos ──
function validateGraph(graph: z.infer<typeof graphSchema>): string[] {
  const issues: string[] = []
  const blockIds = new Set(Object.keys(graph.blocks))

  if (!graph.trigger) {
    issues.push('El workflow no tiene trigger')
    return issues
  }

  const seen = new Set<string>()
  const queue: (string | null)[] = [graph.trigger.next]

  while (queue.length) {
    const id = queue.shift()
    if (!id) continue
    if (seen.has(id)) continue          // ya visitado: corta el ciclo silenciosamente
    if (!blockIds.has(id)) {
      issues.push(`Referencia a bloque inexistente: ${id}`)
      continue
    }
    seen.add(id)
    const block = graph.blocks[id]!
    if (block.kind === 'condition') {
      queue.push(block.next)
      queue.push(block.next_else)
    } else {
      queue.push(block.next)
    }
  }

  // Avisar bloques no alcanzables (huérfanos): no es fatal, solo aviso
  for (const id of blockIds) {
    if (!seen.has(id)) issues.push(`Bloque huérfano (no alcanzable): ${id}`)
  }

  return issues
}

export default async function workflowsRoutes(fastify: FastifyInstance) {
  // ── LIST ──────────────────────────────────────────────────
  fastify.get('/workflows', async (req: FastifyRequest, reply: FastifyReply) => {
    const { data, error } = await req.supabase
      .from('workflows')
      .select('*')
      .eq('clinic_id', req.tenant.clinic_id)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      req.log.error({ err: error }, 'Error listando workflows')
      return reply.status(500).send({ error: 'Error listando workflows' })
    }
    return reply.send({ workflows: data ?? [] })
  })

  // ── GET ONE ───────────────────────────────────────────────
  fastify.get('/workflows/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const { data, error } = await req.supabase
      .from('workflows')
      .select('*')
      .eq('clinic_id', req.tenant.clinic_id)
      .eq('id', id)
      .single()

    if (error || !data) return reply.status(404).send({ error: 'Workflow no encontrado' })
    return reply.send({ workflow: data })
  })

  // ── CREATE ────────────────────────────────────────────────
  fastify.post('/workflows', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', issues: parsed.error.issues })
    }

    const graphIssues = validateGraph(parsed.data.graph)
    const fatal = graphIssues.find((m) => m.startsWith('Referencia') || m.startsWith('El workflow'))
    if (fatal && parsed.data.enabled) {
      return reply.status(400).send({ error: `Grafo inválido: ${fatal}` })
    }

    const { data, error } = await req.supabase
      .from('workflows')
      .insert({
        clinic_id: req.tenant.clinic_id,
        ...parsed.data,
      })
      .select()
      .single()

    if (error || !data) {
      req.log.error({ err: error }, 'Error creando workflow')
      return reply.status(500).send({ error: 'Error creando workflow' })
    }

    return reply.send({ workflow: data, warnings: graphIssues })
  })

  // ── UPDATE ────────────────────────────────────────────────
  fastify.patch('/workflows/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', issues: parsed.error.issues })
    }

    let warnings: string[] = []
    if (parsed.data.graph) {
      warnings = validateGraph(parsed.data.graph)
      const fatal = warnings.find((m) => m.startsWith('Referencia') || m.startsWith('El workflow'))
      const willBeEnabled = parsed.data.enabled ?? true
      if (fatal && willBeEnabled) {
        return reply.status(400).send({ error: `Grafo inválido: ${fatal}` })
      }
    }

    const { data, error } = await req.supabase
      .from('workflows')
      .update(parsed.data)
      .eq('clinic_id', req.tenant.clinic_id)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      req.log.error({ err: error }, 'Error actualizando workflow')
      return reply.status(500).send({ error: 'Error actualizando workflow' })
    }
    return reply.send({ workflow: data, warnings })
  })

  // ── DELETE ────────────────────────────────────────────────
  fastify.delete('/workflows/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const { error } = await req.supabase
      .from('workflows')
      .delete()
      .eq('clinic_id', req.tenant.clinic_id)
      .eq('id', id)

    if (error) {
      req.log.error({ err: error }, 'Error eliminando workflow')
      return reply.status(500).send({ error: 'Error eliminando workflow' })
    }
    return reply.send({ success: true })
  })
}
