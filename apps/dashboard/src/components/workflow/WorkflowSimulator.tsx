// ============================================================
//  CELURA · Simulador de workflows (cliente)
//  Espejo simplificado del engine del backend. No llama a Claude
//  ni a Vision; muestra qué workflow dispara y qué bloques se
//  ejecutarían — para que el doctor entienda el flujo sin enviar
//  un mensaje real por WhatsApp.
// ============================================================

import { useMemo, useState } from 'react'
import {
  Play, RotateCcw, MessageSquare, AlertTriangle, CheckCircle2,
  ArrowRight, Zap, GitBranch, Send,
} from 'lucide-react'
import clsx from 'clsx'
import { blockDef, COLOR_CLASSES } from '@/lib/workflow-catalog'
import type {
  Workflow, WorkflowGraph, WorkflowTrigger, WorkflowBlock,
} from '@/lib/workflow-types'

interface Props {
  workflows: Workflow[]   // todos los workflows del clinic (para simular prioridad)
  active: WorkflowGraph   // el flujo que se está editando ahora
  activeName: string
}

interface SimContext {
  text: string
  isFirstMessage: boolean
  hasPhoto: boolean
  hour: number            // 0–23 (simula horario)
  stage: string
  urgency: string
  score: number
  name: string | null
}

interface SimStep {
  kind: 'trigger' | 'block' | 'note'
  blockId?: string
  label: string
  detail?: string
  branch?: 'yes' | 'no'
}

interface SimResult {
  matched: boolean
  workflowName?: string
  steps: SimStep[]
  response?: string
  escalated?: boolean
  urgency?: string
}

// ── matchers (espejo del engine) ───────────────────────────
function triggerMatches(t: WorkflowTrigger, ctx: SimContext): boolean {
  switch (t.type) {
    case 'message_received': return true
    case 'new_patient': return ctx.isFirstMessage
    case 'photo_received': return ctx.hasPhoto
    case 'keyword_match': {
      const ks = (t.params['keywords'] as string[]) ?? []
      const txt = ctx.text.toLowerCase()
      return ks.some((k) => txt.includes(k.toLowerCase()))
    }
    case 'intent_detected': {
      const intent = (t.params['intent'] as string) ?? ''
      const txt = ctx.text.toLowerCase()
      const map: Record<string, string[]> = {
        price: ['precio', 'cuesta', 'cuanto', 'cuánto', 'costo', 'vale'],
        appointment: ['cita', 'agendar', 'agenda', 'horario', 'disponibilidad'],
        info: ['información', 'informacion', 'consulta', 'pregunta'],
        complaint: ['queja', 'molesto', 'mal servicio', 'reclamo'],
      }
      return (map[intent] ?? []).some((w) => txt.includes(w))
    }
    case 'urgency_level': {
      const lvl = (t.params['level'] as string) ?? 'high'
      return ctx.urgency === lvl
    }
    case 'lead_score_above': {
      const min = Number(t.params['min'] ?? 0)
      return ctx.score >= min
    }
    default: return false
  }
}

function conditionMatches(b: WorkflowBlock, ctx: SimContext): boolean {
  if (b.kind !== 'condition') return false
  switch (b.type) {
    case 'is_business_hours': return ctx.hour >= 8 && ctx.hour < 20
    case 'has_appointment': return false       // sim: por defecto no
    case 'urgency_is': return ctx.urgency === (b.params['level'] as string)
    case 'score_above': return ctx.score > Number(b.params['min'] ?? 0)
    case 'stage_is': return ctx.stage === (b.params['stage'] as string)
    case 'message_contains': {
      const ks = (b.params['keywords'] as string[]) ?? []
      const txt = ctx.text.toLowerCase()
      return ks.some((k) => txt.includes(k.toLowerCase()))
    }
    case 'name_known': return !!ctx.name
    case 'photo_finding': return ctx.hasPhoto    // sim: si hay foto, asume hallazgo
    default: return false
  }
}

function interpolate(text: string, ctx: SimContext): string {
  return text
    .replace(/\{\{\s*name\s*\}\}/g, ctx.name ?? 'paciente')
    .replace(/\{\{\s*assistant\s*\}\}/g, 'Sofia')
}

// ── walker ──────────────────────────────────────────────────
function runGraph(graph: WorkflowGraph, ctx: SimContext, name: string): SimResult {
  const result: SimResult = { matched: false, workflowName: name, steps: [] }
  if (!graph.trigger) {
    result.steps.push({ kind: 'note', label: 'Sin disparador configurado' })
    return result
  }

  if (!triggerMatches(graph.trigger, ctx)) {
    result.steps.push({
      kind: 'trigger',
      label: 'No activado',
      detail: `El disparador "${graph.trigger.type}" no coincide`,
    })
    return result
  }

  result.matched = true
  const def = blockDef(graph.trigger.type)
  result.steps.push({
    kind: 'trigger',
    label: def?.label ?? graph.trigger.type,
    detail: 'Disparador activado',
  })

  // Walk
  const visited = new Set<string>()
  let cur: string | null = graph.trigger.next
  let safety = 100

  while (cur && safety-- > 0) {
    if (visited.has(cur)) {
      result.steps.push({ kind: 'note', label: 'Loop detectado, deteniendo' })
      break
    }
    visited.add(cur)

    const b = graph.blocks[cur]
    if (!b) {
      result.steps.push({ kind: 'note', label: `Bloque ${cur} no existe` })
      break
    }

    const bDef = blockDef(b.type)
    const label = bDef?.label ?? b.type

    if (b.kind === 'condition') {
      const ok = conditionMatches(b, ctx)
      result.steps.push({
        kind: 'block',
        blockId: b.id,
        label,
        detail: ok ? 'Se cumple → rama Sí' : 'No se cumple → rama No',
        branch: ok ? 'yes' : 'no',
      })
      cur = ok ? b.next : b.next_else
      continue
    }

    // Action
    let detail = bDef?.summary(b.params) ?? ''
    switch (b.type) {
      case 'send_message': {
        const txt = interpolate((b.params['text'] as string) ?? '', ctx)
        result.response = txt
        detail = `Envía: "${txt.slice(0, 80)}${txt.length > 80 ? '…' : ''}"`
        break
      }
      case 'ai_respond': {
        const inst = (b.params['instructions'] as string) ?? ''
        result.response = `[Claude respondería siguiendo: "${inst.slice(0, 60)}${inst.length > 60 ? '…' : ''}"]`
        detail = 'Genera respuesta con IA (simulado)'
        break
      }
      case 'escalate_to_human':
        result.escalated = true
        detail = `Escala: ${b.params['reason'] ?? 'sin razón'}`
        break
      case 'set_urgency':
        result.urgency = (b.params['level'] as string) ?? 'medium'
        detail = `Urgencia → ${result.urgency}`
        break
      case 'end_workflow':
        result.steps.push({ kind: 'block', blockId: b.id, label, detail: 'Termina el flujo' })
        return result
    }

    result.steps.push({ kind: 'block', blockId: b.id, label, detail })
    cur = b.next
  }

  return result
}

// ── component ───────────────────────────────────────────────
export default function WorkflowSimulator({ workflows, active, activeName }: Props) {
  const [text, setText] = useState('Hola, tengo mucho dolor en la muela, ¿cuánto cuesta?')
  const [ctx, setCtx] = useState<SimContext>({
    text: '',
    isFirstMessage: false,
    hasPhoto: false,
    hour: 11,
    stage: 'new',
    urgency: 'none',
    score: 30,
    name: null,
  })
  const [results, setResults] = useState<SimResult[] | null>(null)
  const [activeResult, setActiveResult] = useState<SimResult | null>(null)

  const run = () => {
    const baseCtx = { ...ctx, text }

    // Simula la prioridad: prueba todos los workflows enabled, ordenados
    const enabled = workflows
      .filter((w) => w.enabled)
      .sort((a, b) => b.priority - a.priority)

    const all: SimResult[] = enabled.map((w) => runGraph(w.graph, baseCtx, w.name))

    // El que se está editando
    const editing = runGraph(active, baseCtx, activeName || 'Flujo en edición')

    setResults(all)
    // Prioridad de visualización: el que está editando si matchea, si no el primero match
    const winner =
      editing.matched ? editing : all.find((r) => r.matched) ?? editing
    setActiveResult(winner)
  }

  const reset = () => {
    setResults(null)
    setActiveResult(null)
  }

  const presets = useMemo(
    () => [
      { label: 'Dolor agudo', text: 'Tengo mucho dolor en la muela, no aguanto', overrides: { hour: 11 } },
      { label: 'Pregunta precio', text: '¿Cuánto cuesta una limpieza?', overrides: { hour: 11 } },
      { label: 'Primer contacto', text: 'Hola, ¿están ahí?', overrides: { isFirstMessage: true } },
      { label: 'Foto enviada', text: 'Te mando foto del diente', overrides: { hasPhoto: true } },
      { label: 'Fuera de horario', text: 'Tengo una emergencia', overrides: { hour: 23 } },
    ],
    [],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-dark-800/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
            <Play className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Simulador</h3>
            <p className="text-[11px] text-zinc-500">Prueba el flujo sin enviar WhatsApp</p>
          </div>
        </div>
        {results && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] text-zinc-500 hover:bg-white/[0.05] hover:text-white"
          >
            <RotateCcw className="h-3 w-3" />
            Limpiar
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Mensaje simulado */}
        <label className="mb-1 block text-[11px] font-medium text-zinc-400">
          Mensaje del paciente
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Escribe lo que un paciente diría…"
          className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-[13px] text-white placeholder-zinc-600 outline-none focus:border-lime-500/40"
        />

        {/* Presets */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setText(p.text)
                setCtx((c) => ({ ...c, ...p.overrides }))
              }}
              className="rounded-md border border-white/[0.06] bg-dark-700/50 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-lime-500/30 hover:text-lime-300"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Contexto avanzado */}
        <details className="mt-3 rounded-lg border border-white/[0.05] bg-dark-700/30 px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-medium text-zinc-400 hover:text-white">
            Contexto del paciente
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Toggle
              label="Primer contacto"
              value={ctx.isFirstMessage}
              onChange={(v) => setCtx({ ...ctx, isFirstMessage: v })}
            />
            <Toggle
              label="Envió foto"
              value={ctx.hasPhoto}
              onChange={(v) => setCtx({ ...ctx, hasPhoto: v })}
            />
            <div>
              <label className="block text-[10px] text-zinc-500">Hora (0–23)</label>
              <input
                type="number"
                min={0}
                max={23}
                value={ctx.hour}
                onChange={(e) => setCtx({ ...ctx, hour: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border border-dark-500 bg-dark-700 px-2 py-1 text-[12px] text-white outline-none focus:border-lime-500/40"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500">Score (0–100)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={ctx.score}
                onChange={(e) => setCtx({ ...ctx, score: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border border-dark-500 bg-dark-700 px-2 py-1 text-[12px] text-white outline-none focus:border-lime-500/40"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500">Etapa</label>
              <select
                value={ctx.stage}
                onChange={(e) => setCtx({ ...ctx, stage: e.target.value })}
                className="mt-1 w-full rounded-md border border-dark-500 bg-dark-700 px-2 py-1 text-[12px] text-white outline-none focus:border-lime-500/40"
              >
                <option value="new">Nuevo</option>
                <option value="qualifying">Calificando</option>
                <option value="appointment_offered">Cita ofrecida</option>
                <option value="booked">Agendado</option>
                <option value="lost">Perdido</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500">Urgencia</label>
              <select
                value={ctx.urgency}
                onChange={(e) => setCtx({ ...ctx, urgency: e.target.value })}
                className="mt-1 w-full rounded-md border border-dark-500 bg-dark-700 px-2 py-1 text-[12px] text-white outline-none focus:border-lime-500/40"
              >
                <option value="none">Ninguna</option>
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
              </select>
            </div>
          </div>
        </details>

        <button
          onClick={run}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-lime-500 px-4 py-2 text-[13px] font-semibold text-dark-900 transition-colors hover:bg-lime-400"
        >
          <Play className="h-3.5 w-3.5" />
          Simular flujo
        </button>

        {/* Resultados */}
        {activeResult && (
          <div className="mt-5">
            <div className="mb-3 flex items-center gap-2">
              {activeResult.matched ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-lime-400" />
                  <span className="text-xs font-semibold text-lime-300">
                    {activeResult.workflowName} dispara
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-300">
                    Ningún flujo dispara — Claude responderá libremente
                  </span>
                </>
              )}
            </div>

            {/* Steps timeline */}
            <div className="space-y-1.5">
              {activeResult.steps.map((s, i) => (
                <StepRow key={i} step={s} />
              ))}
            </div>

            {/* Respuesta final */}
            {activeResult.response && (
              <div className="mt-4 rounded-xl border border-lime-500/20 bg-lime-500/[0.05] p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-lime-400">
                  <Send className="h-3 w-3" />
                  Respuesta al paciente
                </div>
                <p className="mt-1.5 text-[13px] text-zinc-200">{activeResult.response}</p>
              </div>
            )}

            {(activeResult.escalated || activeResult.urgency) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {activeResult.escalated && (
                  <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-300">
                    Escalado a humano
                  </span>
                )}
                {activeResult.urgency && (
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
                    Urgencia: {activeResult.urgency}
                  </span>
                )}
              </div>
            )}

            {/* Otros workflows */}
            {results && results.length > 1 && (
              <details className="mt-4 rounded-lg border border-white/[0.05] bg-dark-700/30 px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-medium text-zinc-400 hover:text-white">
                  Ver todos los workflows ({results.length})
                </summary>
                <div className="mt-2 space-y-1">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className={clsx(
                        'flex items-center justify-between rounded-md px-2 py-1 text-[11px]',
                        r.matched ? 'bg-lime-500/[0.08] text-lime-300' : 'text-zinc-500',
                      )}
                    >
                      <span className="truncate">{r.workflowName}</span>
                      {r.matched ? (
                        <span className="shrink-0 text-[10px] uppercase">matched</span>
                      ) : (
                        <span className="shrink-0 text-[10px] uppercase text-zinc-600">skip</span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {!activeResult && (
          <div className="mt-6 rounded-xl border border-dashed border-white/[0.06] px-4 py-8 text-center">
            <MessageSquare className="mx-auto h-5 w-5 text-zinc-700" />
            <p className="mt-2 text-[11px] text-zinc-600">
              Escribe un mensaje y pulsa <span className="text-lime-400">Simular</span> para
              ver qué ocurre.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── helpers UI ──────────────────────────────────────────────
function Toggle({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={clsx(
        'flex items-center justify-between rounded-md border px-2 py-1.5 text-left text-[11px] transition-all',
        value
          ? 'border-lime-500/30 bg-lime-500/10 text-lime-300'
          : 'border-white/[0.06] bg-dark-700 text-zinc-500',
      )}
    >
      <span>{label}</span>
      <span
        className={clsx(
          'h-3 w-5 rounded-full transition-colors',
          value ? 'bg-lime-500' : 'bg-dark-500',
        )}
      />
    </button>
  )
}

function StepRow({ step }: { step: SimStep }) {
  if (step.kind === 'note') {
    return (
      <div className="flex items-center gap-2 rounded-md bg-dark-700/40 px-2 py-1.5 text-[11px] text-zinc-500">
        <AlertTriangle className="h-3 w-3" />
        {step.label}
      </div>
    )
  }
  const Icon = step.kind === 'trigger' ? Zap : step.branch ? GitBranch : ArrowRight
  const color =
    step.kind === 'trigger'
      ? 'lime'
      : step.branch === 'yes'
      ? 'lime'
      : step.branch === 'no'
      ? 'rose'
      : 'sky'
  const cc = COLOR_CLASSES[color]!
  return (
    <div className="flex items-start gap-2 rounded-md border border-white/[0.05] bg-dark-700/40 px-2 py-1.5">
      <div className={clsx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md', cc.iconBg, cc.text)}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-white">{step.label}</p>
        {step.detail && <p className="text-[11px] text-zinc-500">{step.detail}</p>}
      </div>
    </div>
  )
}
