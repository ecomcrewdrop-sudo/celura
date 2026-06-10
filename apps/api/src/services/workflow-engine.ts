// ============================================================
//  CELURA · Workflow Engine
//  Evalúa los workflows habilitados de una clínica antes de
//  pasar el mensaje al motor conversacional (Claude). Si algún
//  workflow matchea su trigger, ejecutamos su grafo de bloques
//  y devolvemos los efectos al brain. Si nadie matchea →
//  conversación libre.
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type {
  ClinicConfig,
  Lead,
  Conversation,
  Workflow,
  WorkflowGraph,
  WorkflowBlock,
  TriggerType,
  ConditionType,
  ActionType,
  UrgencyLevel,
  LeadStage,
  VisionAnalysis,
} from '../types/tenant.js'
import type { WAMessage } from './whatsapp.js'

const supabaseAdmin = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { persistSession: false } }
)

// ── Contexto de ejecución ──
export interface EngineContext {
  waMsg: WAMessage
  config: ClinicConfig
  lead: Lead
  conversation: Conversation
  isFirstMessage: boolean
  intent: string
  visionAnalysis: VisionAnalysis | null
  anthropic: Anthropic
}

export interface EngineFollowUp {
  minutes: number
  message: string
}

export interface EngineResult {
  matched: boolean
  workflow_id?: string
  response_text?: string             // si está definido, brain lo envía y NO llama Claude
  lead_updates: Partial<Lead>        // stage, urgency, name, etc
  followups: EngineFollowUp[]
  tags: string[]
  escalated: boolean
  escalation_reason?: string
  needs_photo: boolean
  needs_vision: boolean              // workflow pide analyze_photo
  blocks_executed: number
}

const URGENCY_RANK: Record<UrgencyLevel, number> = {
  low: 0, medium: 1, high: 2, emergency: 3,
}
const SEVERITY_RANK: Record<string, number> = {
  leve: 0, moderado: 1, severo: 2,
}

// ── Reemplaza variables {{name}}, {{clinic}}, {{assistant}} ──
function interpolate(text: string, ctx: EngineContext): string {
  const name = ctx.lead.name ?? ''
  return text
    .replace(/\{\{\s*name\s*\}\}/g, name)
    .replace(/\{\{\s*assistant\s*\}\}/g, ctx.config.assistant_name)
    .replace(/\{\{\s*clinic\s*\}\}/g, 'la clínica')
}

// ── ¿La clínica está en horario laboral ahora? ──
function isBusinessHoursNow(config: ClinicConfig): boolean {
  const now = new Date()
  const days: (keyof typeof config.schedule)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const today = days[now.getDay()]!
  const range = config.schedule[today]
  if (!range) return false
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(range)
  if (!match) return false
  const [, sh, sm, eh, em] = match
  const start = parseInt(sh!) * 60 + parseInt(sm!)
  const end = parseInt(eh!) * 60 + parseInt(em!)
  const cur = now.getHours() * 60 + now.getMinutes()
  return cur >= start && cur <= end
}

// ── ¿El trigger matchea el contexto actual? ──
function triggerMatches(type: TriggerType, params: Record<string, unknown>, ctx: EngineContext): boolean {
  const text = ctx.waMsg.content.toLowerCase()

  switch (type) {
    case 'message_received':
      return true

    case 'new_patient':
      return ctx.isFirstMessage

    case 'keyword_match': {
      const keywords = (params['keywords'] as string[] | undefined) ?? []
      return keywords.some((k) => text.includes(k.toLowerCase()))
    }

    case 'intent_detected': {
      const expected = params['intent'] as string | undefined
      return !!expected && ctx.intent === expected
    }

    case 'photo_received':
      return ctx.waMsg.type === 'image'

    case 'urgency_level': {
      const min = (params['min'] as UrgencyLevel | undefined) ?? 'high'
      return URGENCY_RANK[ctx.lead.urgency_level] >= URGENCY_RANK[min]
    }

    case 'lead_score_above': {
      const threshold = (params['threshold'] as number | undefined) ?? 50
      return ctx.lead.score >= threshold
    }

    default:
      return false
  }
}

// ── ¿La condición se cumple? ──
function conditionMatches(type: ConditionType, params: Record<string, unknown>, ctx: EngineContext): boolean {
  switch (type) {
    case 'is_business_hours':
      return isBusinessHoursNow(ctx.config)

    case 'has_appointment':
      return ctx.lead.stage === 'scheduled' || ctx.lead.stage === 'attended'

    case 'urgency_is':
      return ctx.lead.urgency_level === (params['level'] as UrgencyLevel)

    case 'score_above':
      return ctx.lead.score >= ((params['threshold'] as number | undefined) ?? 50)

    case 'stage_is':
      return ctx.lead.stage === (params['stage'] as LeadStage)

    case 'message_contains': {
      const needles = (params['text'] as string[] | undefined) ?? []
      const t = ctx.waMsg.content.toLowerCase()
      return needles.some((n) => t.includes(n.toLowerCase()))
    }

    case 'name_known':
      return !!ctx.lead.name && ctx.lead.name.length > 0

    case 'photo_finding': {
      if (!ctx.visionAnalysis) return false
      const area = params['area'] as string | undefined
      const minSev = (params['min_severity'] as string | undefined) ?? 'leve'
      const minRank = SEVERITY_RANK[minSev] ?? 0
      return ctx.visionAnalysis.findings.some(
        (f) => (!area || f.area === area) && (SEVERITY_RANK[f.severity] ?? 0) >= minRank,
      )
    }

    default:
      return false
  }
}

// ── Ejecuta un bloque action: muta el resultado y opcionalmente
//    devuelve un texto que el brain debe enviar como respuesta ──
async function runAction(
  type: ActionType,
  params: Record<string, unknown>,
  ctx: EngineContext,
  result: EngineResult,
): Promise<{ response?: string; stop?: boolean }> {
  switch (type) {
    case 'send_message': {
      const text = interpolate((params['text'] as string | undefined) ?? '', ctx)
      return { response: text, stop: false }
    }

    case 'ai_respond': {
      const instructions = (params['instructions'] as string | undefined) ?? 'Responde con empatía y brevedad.'
      const maxLines = (params['max_lines'] as number | undefined) ?? 3
      const system = `Eres ${ctx.config.assistant_name}, asistente humano de una clínica dental.
Estás dentro de un workflow. El doctor te dio estas instrucciones específicas para esta respuesta:

${instructions}

REGLAS:
- Máximo ${maxLines} líneas.
- Habla como humano, no menciones que eres IA.
- Tono: ${ctx.config.tone}.
- Nombre del paciente: ${ctx.lead.name ?? 'desconocido'}.
- Responde en el mismo idioma que el paciente.`

      const recent = ctx.conversation.messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }))
      const messages: Anthropic.MessageParam[] = recent.length
        ? recent
        : [{ role: 'user', content: ctx.waMsg.content || '[imagen]' }]

      const resp = await ctx.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 250,
        system,
        messages,
      })
      const text = resp.content.filter((b) => b.type === 'text').map((b) => b.type === 'text' ? b.text : '').join('')
      return { response: text, stop: false }
    }

    case 'ask_qualifying': {
      const question = interpolate((params['question'] as string | undefined) ?? '', ctx)
      return { response: question, stop: false }
    }

    case 'request_photo': {
      const reason = interpolate((params['reason'] as string | undefined) ?? '¿Podrías enviarme una foto para verlo mejor?', ctx)
      result.needs_photo = true
      return { response: reason, stop: false }
    }

    case 'analyze_photo': {
      result.needs_vision = true
      return { stop: false }
    }

    case 'offer_appointment': {
      const treatment = params['treatment'] as string | undefined
      const txt = treatment
        ? `Te puedo agendar para ${treatment}. ¿Qué día y hora te queda mejor?`
        : '¿Qué día y hora te queda mejor para tu valoración?'
      return { response: txt, stop: false }
    }

    case 'quote_price': {
      const treatment = (params['treatment'] as string | undefined) ?? 'el tratamiento'
      const min = params['min'] as number | undefined
      const max = params['max'] as number | undefined
      const currency = (params['currency'] as string | undefined) ?? 'USD'
      if (min == null || max == null) return { stop: false }
      const range = min === max
        ? `${currency} ${min}`
        : `entre ${currency} ${min} y ${currency} ${max}`
      const txt = `${treatment} suele estar ${range}, pero el precio final depende de tu caso. ¿Te agendamos una valoración?`
      return { response: txt, stop: false }
    }

    case 'escalate_to_human': {
      result.escalated = true
      result.escalation_reason = (params['reason'] as string | undefined) ?? 'workflow'
      return { stop: false }
    }

    case 'set_stage': {
      const stage = params['stage'] as LeadStage | undefined
      if (stage) result.lead_updates.stage = stage
      return { stop: false }
    }

    case 'set_urgency': {
      const level = params['level'] as UrgencyLevel | undefined
      if (level) result.lead_updates.urgency_level = level
      return { stop: false }
    }

    case 'schedule_followup': {
      const minutes = (params['minutes'] as number | undefined) ?? 60
      const message = interpolate((params['message'] as string | undefined) ?? '', ctx)
      if (message) result.followups.push({ minutes, message })
      return { stop: false }
    }

    case 'tag_lead': {
      const tag = params['tag'] as string | undefined
      if (tag) result.tags.push(tag)
      return { stop: false }
    }

    case 'end_workflow':
      return { stop: true }

    default:
      return { stop: false }
  }
}

// ── Recorre el grafo desde el primer bloque ejecutando hasta
//    encontrar una acción que produce respuesta o end ──
async function executeGraph(graph: WorkflowGraph, ctx: EngineContext, result: EngineResult): Promise<void> {
  if (!graph.trigger) return
  let currentId: string | null = graph.trigger.next
  const visited = new Set<string>()
  let collectedResponse = ''

  while (currentId) {
    if (visited.has(currentId)) break          // anti-loop
    visited.add(currentId)
    const block: WorkflowBlock | undefined = graph.blocks[currentId]
    if (!block) break

    result.blocks_executed++

    if (block.kind === 'condition') {
      const ok = conditionMatches(block.type, block.params, ctx)
      currentId = ok ? block.next : block.next_else
      continue
    }

    const out = await runAction(block.type, block.params, ctx, result)
    if (out.response) {
      // Concatenamos respuestas múltiples con doble salto: WhatsApp lo respeta
      collectedResponse = collectedResponse
        ? `${collectedResponse}\n\n${out.response}`
        : out.response
    }
    if (out.stop) break
    currentId = block.next
  }

  if (collectedResponse) result.response_text = collectedResponse
}

// ── API pública: corre todos los workflows enabled de la clínica ──
export async function runWorkflowsForMessage(ctx: EngineContext): Promise<EngineResult> {
  const result: EngineResult = {
    matched: false,
    lead_updates: {},
    followups: [],
    tags: [],
    escalated: false,
    needs_photo: false,
    needs_vision: false,
    blocks_executed: 0,
  }

  const { data: workflows } = await supabaseAdmin
    .from('workflows')
    .select('*')
    .eq('clinic_id', ctx.config.clinic_id)
    .eq('enabled', true)
    .order('priority', { ascending: false })

  if (!workflows || workflows.length === 0) return result

  for (const wf of workflows as Workflow[]) {
    if (!wf.graph?.trigger) continue
    if (!triggerMatches(wf.graph.trigger.type, wf.graph.trigger.params, ctx)) continue

    result.matched = true
    result.workflow_id = wf.id

    await executeGraph(wf.graph, ctx, result)

    // Telemetría: marcar como ejecutado y matched
    void supabaseAdmin
      .from('workflows')
      .update({
        runs_total: wf.runs_total + 1,
        runs_matched: wf.runs_matched + 1,
        last_run_at: new Date().toISOString(),
      })
      .eq('id', wf.id)
      .then(() => undefined)

    // Solo el primer workflow que matchea ejecuta. Priority controla el orden.
    break
  }

  return result
}
