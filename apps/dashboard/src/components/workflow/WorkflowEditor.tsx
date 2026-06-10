import { useMemo, useState, type ReactElement } from 'react'
import { Plus, Zap, Check, X } from 'lucide-react'
import clsx from 'clsx'
import BlockNode from './BlockNode'
import BlockPicker from './BlockPicker'
import {
  TRIGGERS, COLOR_CLASSES, blockDef, type BlockDef,
} from '@/lib/workflow-catalog'
import {
  newBlockId,
  type WorkflowGraph, type WorkflowBlock,
  type TriggerType,
} from '@/lib/workflow-types'

interface Props {
  graph: WorkflowGraph
  onChange: (g: WorkflowGraph) => void
}

// Reemplaza un bloque o el trigger en una copia inmutable
function cloneGraph(g: WorkflowGraph): WorkflowGraph {
  return {
    trigger: g.trigger ? { ...g.trigger, params: { ...g.trigger.params } } : null,
    blocks: Object.fromEntries(
      Object.entries(g.blocks).map(([id, b]) => [id, { ...b, params: { ...b.params } }]),
    ),
  }
}

// Recolecta IDs descendientes desde startId (para borrar en cascada)
function collectDescendants(g: WorkflowGraph, startId: string | null, acc: Set<string> = new Set()): Set<string> {
  if (!startId || acc.has(startId)) return acc
  const b = g.blocks[startId]
  if (!b) return acc
  acc.add(startId)
  if (b.kind === 'condition') {
    collectDescendants(g, b.next, acc)
    collectDescendants(g, b.next_else, acc)
  } else {
    collectDescendants(g, b.next, acc)
  }
  return acc
}

export default function WorkflowEditor({ graph, onChange }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [triggerPickerOpen, setTriggerPickerOpen] = useState(false)
  const [picker, setPicker] = useState<{
    parentId: string                // 'trigger' o block id
    slot: 'next' | 'next_else'
    allow: ('condition' | 'action')[]
  } | null>(null)

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }))

  const validation = useMemo(() => validateGraph(graph), [graph])

  // ── Mutaciones ─────────────────────────────────────────
  function setTriggerType(type: TriggerType) {
    const def = TRIGGERS.find((t) => t.type === type)!
    const g = cloneGraph(graph)
    g.trigger = {
      id: 'trigger',
      type,
      params: { ...def.defaults },
      next: g.trigger?.next ?? null,
    }
    onChange(g)
    setTriggerPickerOpen(false)
    setExpanded((s) => ({ ...s, trigger: true }))
  }

  function setTriggerParam(key: string, value: unknown) {
    if (!graph.trigger) return
    const g = cloneGraph(graph)
    g.trigger!.params[key] = value
    onChange(g)
  }

  function setBlockParam(id: string, key: string, value: unknown) {
    const g = cloneGraph(graph)
    if (!g.blocks[id]) return
    g.blocks[id].params[key] = value
    onChange(g)
  }

  function appendBlock(parentId: string, slot: 'next' | 'next_else', def: BlockDef) {
    const g = cloneGraph(graph)
    const id = newBlockId()
    const newBlock: WorkflowBlock =
      def.kind === 'condition'
        ? { id, kind: 'condition', type: def.type as never, params: { ...def.defaults }, next: null, next_else: null }
        : { id, kind: 'action',    type: def.type as never, params: { ...def.defaults }, next: null }
    g.blocks[id] = newBlock

    // Camina la cadena desde parent[slot] hasta el final, y engancha ahí.
    const setNext = (ownerId: string, ownerSlot: 'next' | 'next_else', nextId: string | null) => {
      if (ownerId === 'trigger') g.trigger!.next = nextId
      else {
        const owner = g.blocks[ownerId]
        if (!owner) return
        if (owner.kind === 'condition' && ownerSlot === 'next_else') owner.next_else = nextId
        else owner.next = nextId
      }
    }
    const getNext = (ownerId: string, ownerSlot: 'next' | 'next_else'): string | null => {
      if (ownerId === 'trigger') return g.trigger?.next ?? null
      const owner = g.blocks[ownerId]
      if (!owner) return null
      if (owner.kind === 'condition' && ownerSlot === 'next_else') return owner.next_else
      return owner.next
    }

    let ownerId = parentId
    let ownerSlot = slot
    let cur = getNext(ownerId, ownerSlot)
    while (cur) {
      const b = g.blocks[cur]
      if (!b) break
      ownerId = cur
      // Para cadenas, siempre seguimos por 'next'. Si encontramos una condición,
      // no avanzamos más por ahí (sus ramas son hojas independientes).
      if (b.kind === 'condition') { cur = null; break }
      ownerSlot = 'next'
      cur = b.next
    }
    setNext(ownerId, ownerSlot, id)

    onChange(g)
    setExpanded((s) => ({ ...s, [id]: true }))
    setPicker(null)
  }

  function deleteBlock(id: string) {
    const g = cloneGraph(graph)
    // Encuentra al padre (quién apunta a id) y re-conecta saltando al `next` del bloque
    // (para acciones). Para condiciones: borramos todos los descendientes.
    const block = g.blocks[id]
    if (!block) return

    const findOwner = (): { ownerId: string; slot: 'next' | 'next_else' } | null => {
      if (g.trigger?.next === id) return { ownerId: 'trigger', slot: 'next' }
      for (const [bid, b] of Object.entries(g.blocks)) {
        if (b.kind === 'condition') {
          if (b.next === id) return { ownerId: bid, slot: 'next' }
          if (b.next_else === id) return { ownerId: bid, slot: 'next_else' }
        } else if (b.next === id) {
          return { ownerId: bid, slot: 'next' }
        }
      }
      return null
    }

    const owner = findOwner()
    const fallback: string | null = block.kind === 'condition' ? null : block.next
    if (owner) {
      if (owner.ownerId === 'trigger') g.trigger!.next = fallback
      else {
        const ob = g.blocks[owner.ownerId]!
        if (ob.kind === 'condition' && owner.slot === 'next_else') ob.next_else = fallback
        else ob.next = fallback
      }
    }

    // Borra el bloque y, si era condición, todos sus descendientes
    if (block.kind === 'condition') {
      const dead = new Set<string>([id])
      collectDescendants(g, block.next, dead)
      collectDescendants(g, block.next_else, dead)
      for (const d of dead) delete g.blocks[d]
    } else {
      delete g.blocks[id]
    }
    onChange(g)
  }

  // ── Render recursivo de una cadena ─────────────────────
  function renderChain(
    startId: string | null,
    parent: { parentId: string; slot: 'next' | 'next_else' },
    depth: number,
    visited: Set<string> = new Set(),
  ): ReactElement {
    if (!startId) {
      return (
        <AddButton
          allow={depth >= 6 ? ['action'] : ['action', 'condition']}
          onClick={() => setPicker({ parentId: parent.parentId, slot: parent.slot, allow: depth >= 6 ? ['action'] : ['action', 'condition'] })}
          variant={depth === 0 ? 'primary' : 'subtle'}
        />
      )
    }

    if (visited.has(startId)) {
      return <Hint text="↻ Ciclo detectado — un bloque se referencia a sí mismo." tone="rose" />
    }
    visited.add(startId)

    const block = graph.blocks[startId]
    if (!block) {
      return <Hint text={`⚠ Bloque inexistente: ${startId}`} tone="rose" />
    }

    const invalid = validation.invalidIds.has(startId)

    if (block.kind === 'condition') {
      return (
        <>
          <Connector />
          <BlockNode
            block={block}
            expanded={!!expanded[startId]}
            onToggle={() => toggle(startId)}
            onParamChange={(k, v) => setBlockParam(startId, k, v)}
            onDelete={() => deleteBlock(startId)}
            invalid={invalid}
          />
          <BranchView
            left={renderChain(block.next, { parentId: startId, slot: 'next' }, depth + 1, visited)}
            right={renderChain(block.next_else, { parentId: startId, slot: 'next_else' }, depth + 1, visited)}
          />
        </>
      )
    }

    return (
      <>
        <Connector />
        <BlockNode
          block={block}
          expanded={!!expanded[startId]}
          onToggle={() => toggle(startId)}
          onParamChange={(k, v) => setBlockParam(startId, k, v)}
          onDelete={() => deleteBlock(startId)}
          invalid={invalid}
        />
        {renderChain(block.next, { parentId: startId, slot: 'next' }, depth, visited)}
      </>
    )
  }

  return (
    <div className="space-y-2">
      {/* Trigger */}
      {graph.trigger ? (
        <BlockNode
          block={graph.trigger}
          kindOverride="trigger"
          expanded={!!expanded['trigger']}
          onToggle={() => toggle('trigger')}
          onParamChange={(k, v) => setTriggerParam(k, v)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setTriggerPickerOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-lime-500/30 bg-lime-500/[0.04] px-4 py-4 text-left hover:border-lime-500/50 hover:bg-lime-500/[0.06]"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime-500/20 text-lime-300">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-lime-300">Elige el disparador</p>
            <p className="mt-0.5 text-xs text-zinc-500">¿Cuándo debe activarse este flujo?</p>
          </div>
        </button>
      )}

      {/* Botón para cambiar trigger */}
      {graph.trigger && (
        <button
          type="button"
          onClick={() => setTriggerPickerOpen(true)}
          className="ml-auto block text-[11px] text-zinc-500 hover:text-lime-400"
        >
          Cambiar disparador →
        </button>
      )}

      {/* Cadena */}
      {graph.trigger && renderChain(graph.trigger.next, { parentId: 'trigger', slot: 'next' }, 0)}

      {/* Validación summary */}
      {validation.warnings.length > 0 && (
        <div className="mt-4 space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
            Avisos del flujo
          </p>
          {validation.warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-300/80">• {w}</p>
          ))}
        </div>
      )}

      {/* Trigger picker dialog */}
      {triggerPickerOpen && (
        <TriggerPickerDialog
          currentType={graph.trigger?.type}
          onPick={setTriggerType}
          onClose={() => setTriggerPickerOpen(false)}
        />
      )}

      {/* Block picker */}
      <BlockPicker
        open={!!picker}
        allow={picker?.allow ?? ['action', 'condition']}
        onPick={(def) => picker && appendBlock(picker.parentId, picker.slot, def)}
        onClose={() => setPicker(null)}
      />
    </div>
  )
}

// ── Subcomponentes ─────────────────────────────────────────

function Connector() {
  return (
    <div className="my-1 flex justify-center">
      <div className="h-3 w-px bg-gradient-to-b from-white/[0.06] to-white/[0.12]" />
    </div>
  )
}

function AddButton({
  onClick,
  variant = 'subtle',
}: {
  onClick: () => void
  allow: ('condition' | 'action')[]
  variant?: 'primary' | 'subtle'
}) {
  return (
    <>
      <Connector />
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          'flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-2.5 text-xs font-medium transition-all',
          variant === 'primary'
            ? 'border-lime-500/30 text-lime-400 hover:border-lime-500/60 hover:bg-lime-500/[0.06]'
            : 'border-white/[0.06] text-zinc-500 hover:border-white/[0.15] hover:text-zinc-300',
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar bloque
      </button>
    </>
  )
}

function BranchView({ left, right }: { left: ReactElement; right: ReactElement }) {
  return (
    <div className="mt-1 grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-lime-500/15 bg-lime-500/[0.02] p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-lime-400">
          <Check className="h-3 w-3" />
          Si se cumple
        </div>
        {left}
      </div>
      <div className="rounded-xl border border-rose-500/15 bg-rose-500/[0.02] p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-rose-400">
          <X className="h-3 w-3" />
          Si NO se cumple
        </div>
        {right}
      </div>
    </div>
  )
}

function Hint({ text, tone }: { text: string; tone: 'rose' | 'amber' }) {
  const c = tone === 'rose' ? 'text-rose-400 border-rose-500/20 bg-rose-500/[0.05]' : 'text-amber-400 border-amber-500/20 bg-amber-500/[0.05]'
  return (
    <div className={clsx('rounded-lg border px-3 py-2 text-[11px]', c)}>{text}</div>
  )
}

function TriggerPickerDialog({
  currentType,
  onPick,
  onClose,
}: {
  currentType?: TriggerType
  onPick: (t: TriggerType) => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl border border-white/[0.08] bg-dark-800 p-5 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Elegir disparador</h3>
            <p className="mt-0.5 text-xs text-zinc-500">¿Cuándo debe activarse este flujo?</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/[0.05]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TRIGGERS.map((t) => {
            const cc = COLOR_CLASSES[t.color]!
            const Icon = t.icon
            const active = currentType === t.type
            return (
              <button
                key={t.type}
                onClick={() => onPick(t.type as TriggerType)}
                className={clsx(
                  'flex items-start gap-3 rounded-xl border bg-dark-700/50 px-3 py-2.5 text-left transition-all',
                  active ? 'border-lime-500/50 ring-2 ring-lime-500/20' : 'border-white/[0.06] hover:border-lime-500/30 hover:bg-dark-700',
                )}
              >
                <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', cc.iconBg, cc.text)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{t.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{t.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Validación local del grafo ─────────────────────────────
function validateGraph(g: WorkflowGraph): { invalidIds: Set<string>; warnings: string[] } {
  const invalidIds = new Set<string>()
  const warnings: string[] = []
  if (!g.trigger) return { invalidIds, warnings: ['Falta elegir el disparador.'] }

  for (const [id, b] of Object.entries(g.blocks)) {
    if (b.kind === 'action') {
      // Acciones tipo send_message / ai_respond requieren texto/instrucciones
      if (b.type === 'send_message' && !((b.params['text'] as string) ?? '').trim()) {
        invalidIds.add(id)
        warnings.push(`"Enviar mensaje" sin texto.`)
      }
      if (b.type === 'ai_respond' && !((b.params['instructions'] as string) ?? '').trim()) {
        invalidIds.add(id)
        warnings.push(`"Responder con IA" sin instrucciones.`)
      }
      if (b.type === 'quote_price' && (!b.params['treatment'] || !b.params['min'] || !b.params['max'])) {
        invalidIds.add(id)
        warnings.push(`"Cotizar rango" sin tratamiento o precios.`)
      }
    }
  }

  // Bloques huérfanos (no alcanzables desde el trigger)
  const reachable = new Set<string>()
  const stack: (string | null)[] = [g.trigger.next]
  while (stack.length) {
    const id = stack.pop()
    if (!id || reachable.has(id)) continue
    reachable.add(id)
    const b = g.blocks[id]
    if (!b) continue
    if (b.kind === 'condition') {
      stack.push(b.next, b.next_else)
    } else {
      stack.push(b.next)
    }
  }
  const orphaned = Object.keys(g.blocks).filter((id) => !reachable.has(id))
  if (orphaned.length > 0) {
    warnings.push(`${orphaned.length} bloque(s) huérfano(s) no alcanzable(s).`)
  }

  return { invalidIds, warnings }
}
