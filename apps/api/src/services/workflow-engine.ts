// ============================================================
//  CELURA · Workflow Engine
//  Evalúa los workflows habilitados de una clínica antes de
//  pasar el mensaje al motor conversacional (Claude). Si algún
//  workflow matchea su trigger, ejecutamos su grafo de bloques
//  y devolvemos los efectos al brain. Si nadie matchea →
//  conversación libre.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import type { AIClient } from './ai-provider.js'
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
  ai: AIClient
  /** El brain marca true cuando acaba de confirmar/agendar una cita en este turno */
  justConfirmedAppointment?: boolean
  /** Si el brain ya detectó timezone de la clínica */
  timezone?: string
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
  /** Refuerzos de persona que el brain debe concatenar al system prompt */
  persona_addons: string[]
  /** Si true, el brain debe respetar quiet hours para las respuestas siguientes */
  defer_until_quiet_hours_end: boolean
}

// ── Detección simple de objeciones por keywords ──
const OBJECTION_KEYWORDS: Record<string, string[]> = {
  price:      ['caro', 'mucho dinero', 'precio alto', 'es mucho', 'no me alcanza para eso'],
  thinking:   ['lo pienso', 'lo pensaré', 'lo pensare', 'voy a pensar', 'después te digo', 'despues te digo'],
  competitor: ['otra clínica', 'otra clinica', 'más barato en', 'mas barato en', 'me cobran menos', 'cotizaron'],
  no_money:   ['no tengo dinero', 'no tengo plata', 'sin presupuesto', 'no me alcanza', 'me quedé sin'],
}

function detectObjection(text: string): string | null {
  const lower = text.toLowerCase()
  for (const [kind, kws] of Object.entries(OBJECTION_KEYWORDS)) {
    if (kws.some((k) => lower.includes(k))) return kind
  }
  return null
}

// ── ¿Estamos dentro de la ventana de quiet hours configurada? ──
function isInQuietHours(config: ClinicConfig, timezone: string): boolean {
  const quiet = config.followup_config?.quiet_hours
  if (!quiet?.enabled || !quiet.from || !quiet.to) return false
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
    const now = h * 60 + m
    const [fh, fm] = quiet.from.split(':').map((n) => parseInt(n, 10))
    const [th, tm] = quiet.to.split(':').map((n) => parseInt(n, 10))
    const from = (fh ?? 0) * 60 + (fm ?? 0)
    const to = (th ?? 0) * 60 + (tm ?? 0)
    if (from <= to) return now >= from && now < to
    return now >= from || now < to     // cruza medianoche
  } catch {
    return false
  }
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

    case 'appointment_confirmed':
      return !!ctx.justConfirmedAppointment

    case 'appointment_completed':
      // Solo lo activa el job que marca cita como completed; en runtime no.
      return false

    case 'lead_inactive_days': {
      // En runtime per-message no aplica (el lead acaba de hablar).
      // Reservado para el job de reactivación que llama runWorkflowsForMessage
      // con un waMsg sintético. Por ahora siempre false.
      const days = (params['days'] as number | undefined) ?? 7
      if (!ctx.lead.last_message_at) return false
      const last = new Date(ctx.lead.last_message_at).getTime()
      const ageDays = (Date.now() - last) / (1000 * 60 * 60 * 24)
      return ageDays >= days && ctx.isFirstMessage === false   // solo si no es un mensaje vivo
    }

    case 'objection_detected': {
      const expectedKind = params['kind'] as string | undefined
      const detected = detectObjection(text)
      if (!detected) return false
      return !expectedKind || detected === expectedKind
    }

    case 'treatment_mentioned': {
      const explicit = (params['treatment'] as string | undefined)?.trim().toLowerCase()
      if (explicit) return text.includes(explicit)
      // Cualquier tratamiento de la lista de la clínica
      return ctx.config.treatments.some((t) => text.includes(t.toLowerCase()))
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

    case 'quiet_hours_now':
      return isInQuietHours(ctx.config, ctx.timezone ?? 'America/Bogota')

    case 'is_weekend': {
      const day = new Date().getDay()
      return day === 0 || day === 6
    }

    case 'last_message_age_hours': {
      const hours = (params['hours'] as number | undefined) ?? 24
      if (!ctx.lead.last_message_at) return true
      const last = new Date(ctx.lead.last_message_at).getTime()
      const ageHours = (Date.now() - last) / (1000 * 60 * 60)
      return ageHours >= hours
    }

    case 'times_contacted_above': {
      const min = (params['count'] as number | undefined) ?? 2
      const assistantMsgs = ctx.conversation.messages.filter((m) => m.role === 'assistant').length
      return assistantMsgs > min
    }

    case 'has_phone':
      return !!ctx.lead.phone && ctx.lead.phone.length > 0

    case 'tone_is':
      return ctx.config.tone === (params['tone'] as string)

    default:
      return false
  }
}

// ── Calcula 2 slots libres del próximo día abierto ──
//    Retorna texto humano listo para mandar
async function computeNextSlots(
  ctx: EngineContext,
  durationMinutes: number,
): Promise<string | null> {
  const dayKeys: (keyof typeof ctx.config.schedule)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const dayLabels = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

  // Buscamos desde mañana hasta 7 días en adelante
  for (let d = 1; d <= 7; d++) {
    const date = new Date()
    date.setDate(date.getDate() + d)
    const dayIdx = date.getDay()
    const range = ctx.config.schedule[dayKeys[dayIdx]!]
    if (!range) continue
    const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(range)
    if (!m) continue
    const [, sh, sm, eh, em] = m
    const startMin = parseInt(sh!) * 60 + parseInt(sm!)
    const endMin = parseInt(eh!) * 60 + parseInt(em!)

    // Citas ya agendadas ese día
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date);   dayEnd.setHours(23, 59, 59, 999)
    const { data: appts } = await supabaseAdmin
      .from('appointments')
      .select('start_at, end_at')
      .eq('clinic_id', ctx.config.clinic_id)
      .gte('start_at', dayStart.toISOString())
      .lte('start_at', dayEnd.toISOString())
      .neq('status', 'cancelled')

    const busy = (appts ?? []).map((a) => ({
      from: new Date((a as { start_at: string }).start_at),
      to: new Date((a as { end_at: string }).end_at),
    }))

    // Iteramos slots cada 30 min, recogemos los primeros 2 libres
    const slots: string[] = []
    for (let t = startMin; t + durationMinutes <= endMin; t += 30) {
      const slotStart = new Date(date)
      slotStart.setHours(Math.floor(t / 60), t % 60, 0, 0)
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000)
      const conflicts = busy.some((b) => slotStart < b.to && slotEnd > b.from)
      if (conflicts) continue
      const hh = String(Math.floor(t / 60)).padStart(2, '0')
      const mm = String(t % 60).padStart(2, '0')
      slots.push(`${hh}:${mm}`)
      if (slots.length === 2) break
    }
    if (slots.length === 0) continue

    const dayLabel = dayLabels[dayIdx]
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}`
    if (slots.length === 1) {
      return `Te puedo agendar el ${dayLabel} ${dateStr} a las ${slots[0]}. ¿Te va?`
    }
    return `Tengo disponibilidad el ${dayLabel} ${dateStr} a las ${slots[0]} o ${slots[1]}. ¿Cuál te queda mejor?`
  }
  return null
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
      const messages = recent.length
        ? recent
        : [{ role: 'user' as const, content: ctx.waMsg.content || '[imagen]' }]

      const resp = await ctx.ai.chat({
        system,
        messages,
        maxTokens: 250,
      })
      return { response: resp.text, stop: false }
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

    case 'send_template': {
      const key = params['template_key'] as string | undefined
      const templates = ctx.config.followup_config?.templates as Record<string, string> | undefined
      if (!key || !templates) return { stop: false }
      const raw = templates[key]
      if (!raw) return { stop: false }
      return { response: interpolate(raw, ctx), stop: false }
    }

    case 'confirm_appointment': {
      // Fórmula oficial. El brain ya hace insert al detectar confirmación;
      // aquí simplemente refuerza el mensaje si el workflow lo pide.
      const name = ctx.lead.name ?? ''
      const txt = name
        ? `Listo ${name} ✅ te dejo agendada tu cita. Si necesitas reagendar, escríbeme con tiempo 😊`
        : `Listo ✅ te dejo agendada la cita. Si necesitas reagendar, escríbeme con tiempo 😊`
      return { response: txt, stop: false }
    }

    case 'propose_slots': {
      const duration = (params['duration_minutes'] as number | undefined) ?? 60
      const txt = await computeNextSlots(ctx, duration)
      if (!txt) return { stop: false }
      return { response: txt, stop: false }
    }

    case 'pivot_back_to_goal': {
      const brief = interpolate((params['brief_answer'] as string | undefined) ?? '', ctx).trim()
      const pivot = '¿Te agendo una valoración rápida para resolverlo en consulta?'
      const txt = brief ? `${brief}\n\n${pivot}` : pivot
      return { response: txt, stop: false }
    }

    case 'request_data': {
      const fields = (params['fields'] as string[] | undefined) ?? ['nombre', 'apellido', 'telefono', 'motivo']
      const numbered = fields.map((f, i) => `${i + 1}. ${f.charAt(0).toUpperCase() + f.slice(1)}`).join('\n')
      const txt = `Perfecto 😊\nPara agendarte necesito estos datos:\n\n${numbered}`
      return { response: txt, stop: false }
    }

    case 'wait_minutes': {
      // Implementación lite: convertimos en un schedule_followup vacío para
      // que el scheduler retome más tarde. Si el workflow tenía bloques
      // después, los marcamos como diferidos (no se ejecutan en este turno).
      const minutes = (params['minutes'] as number | undefined) ?? 30
      result.followups.push({ minutes, message: '' })
      return { stop: true }
    }

    case 'respect_quiet_hours': {
      if (isInQuietHours(ctx.config, ctx.timezone ?? 'America/Bogota')) {
        result.defer_until_quiet_hours_end = true
      }
      return { stop: false }
    }

    case 'reinforce_persona': {
      const addon = (params['persona_addon'] as string | undefined)?.trim()
      if (addon) result.persona_addons.push(addon)
      return { stop: false }
    }

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
    persona_addons: [],
    defer_until_quiet_hours_end: false,
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
