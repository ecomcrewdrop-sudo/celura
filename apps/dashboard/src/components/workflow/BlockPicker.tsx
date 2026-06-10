import { useState } from 'react'
import { X } from 'lucide-react'
import { CONDITIONS, ACTIONS, COLOR_CLASSES, type BlockDef } from '@/lib/workflow-catalog'
import clsx from 'clsx'

interface Props {
  open: boolean
  allow: ('condition' | 'action')[]
  onPick: (def: BlockDef) => void
  onClose: () => void
}

export default function BlockPicker({ open, allow, onPick, onClose }: Props) {
  const [tab, setTab] = useState<'action' | 'condition'>(allow.includes('action') ? 'action' : 'condition')
  const [q, setQ] = useState('')

  if (!open) return null

  const source = tab === 'action' ? ACTIONS : CONDITIONS
  const blocks = source.filter(
    (b) =>
      !q ||
      b.label.toLowerCase().includes(q.toLowerCase()) ||
      b.description.toLowerCase().includes(q.toLowerCase()),
  )

  const groups = Array.from(new Set(blocks.map((b) => b.group)))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-dark-800 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-white">Agregar bloque</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Elige qué hacer a continuación en el flujo.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/[0.05] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs + search */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
          <div className="flex gap-1 rounded-lg bg-dark-700 p-1">
            {allow.includes('action') && (
              <button
                onClick={() => setTab('action')}
                className={clsx(
                  'rounded-md px-3 py-1 text-xs font-medium',
                  tab === 'action' ? 'bg-dark-600 text-white' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                Acciones
              </button>
            )}
            {allow.includes('condition') && (
              <button
                onClick={() => setTab('condition')}
                className={clsx(
                  'rounded-md px-3 py-1 text-xs font-medium',
                  tab === 'condition' ? 'bg-dark-600 text-white' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                Condiciones
              </button>
            )}
          </div>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="w-48 rounded-lg border border-dark-500 bg-dark-700 px-3 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-lime-500/40"
          />
        </div>

        {/* Grid */}
        <div className="max-h-[480px] overflow-y-auto px-5 py-4">
          {groups.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">Sin resultados</p>
          )}
          {groups.map((group) => (
            <div key={group} className="mb-5 last:mb-0">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                {group}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {blocks
                  .filter((b) => b.group === group)
                  .map((b) => {
                    const cc = COLOR_CLASSES[b.color]!
                    const Icon = b.icon
                    return (
                      <button
                        key={b.type}
                        onClick={() => onPick(b)}
                        className={clsx(
                          'group flex items-start gap-3 rounded-xl border bg-dark-700/50 px-3 py-2.5 text-left transition-all hover:border-lime-500/30 hover:bg-dark-700',
                          'border-white/[0.06]',
                        )}
                      >
                        <div
                          className={clsx(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                            cc.iconBg,
                            cc.text,
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{b.label}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">
                            {b.description}
                          </p>
                        </div>
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
