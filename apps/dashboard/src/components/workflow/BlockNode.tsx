import { useState } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { blockDef, COLOR_CLASSES, type BlockField } from '@/lib/workflow-catalog'
import type { WorkflowBlock, WorkflowTrigger } from '@/lib/workflow-types'

interface Props {
  block: WorkflowBlock | WorkflowTrigger
  kindOverride?: 'trigger' | 'condition' | 'action'
  expanded: boolean
  onToggle: () => void
  onParamChange: (key: string, value: unknown) => void
  onDelete?: () => void              // null para trigger (no se borra)
  invalid?: boolean
}

export default function BlockNode({
  block,
  kindOverride,
  expanded,
  onToggle,
  onParamChange,
  onDelete,
  invalid,
}: Props) {
  const def = blockDef(block.type)
  if (!def) return null
  const cc = COLOR_CLASSES[def.color]!
  const Icon = def.icon
  const kind = kindOverride ?? def.kind

  return (
    <div
      className={clsx(
        'group relative rounded-xl border transition-all',
        cc.border,
        cc.bg,
        invalid && 'ring-2 ring-rose-500/40',
      )}
    >
      {/* Header: clic abre/cierra */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <div
          className={clsx(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            cc.iconBg,
            cc.text,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={clsx('text-[10px] font-semibold uppercase tracking-wider', cc.text)}>
              {kind === 'trigger' ? 'Cuando' : kind === 'condition' ? 'Si' : 'Entonces'}
            </span>
            <span className="text-[13px] font-medium text-white">{def.label}</span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
            {def.summary(block.params)}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-zinc-600" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-600" />
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="rounded-md p-1 text-zinc-600 opacity-0 transition-opacity hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
            title="Eliminar bloque"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </button>

      {/* Cuerpo: parámetros */}
      {expanded && def.fields.length > 0 && (
        <div className="space-y-3 border-t border-white/[0.05] px-3 py-3">
          {def.fields.map((field) => (
            <FieldEditor
              key={field.key}
              field={field}
              value={block.params[field.key]}
              onChange={(v) => onParamChange(field.key, v)}
            />
          ))}
        </div>
      )}
      {expanded && def.fields.length === 0 && (
        <div className="border-t border-white/[0.05] px-3 py-2.5 text-[11px] text-zinc-500">
          Este bloque no requiere configuración.
        </div>
      )}
    </div>
  )
}

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: BlockField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const baseInput =
    'w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-[13px] text-white placeholder-zinc-600 outline-none focus:border-lime-500/40'

  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-zinc-400">
        {field.label}
        {field.optional && <span className="ml-1 text-zinc-600">(opcional)</span>}
      </label>
      {field.type === 'text' && (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={baseInput}
        />
      )}
      {field.type === 'number' && (
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder={field.placeholder}
          className={baseInput}
        />
      )}
      {field.type === 'textarea' && (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={baseInput}
        />
      )}
      {field.type === 'select' && (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {(field.type === 'tags' || field.type === 'keywords') && (
        <TagsInput value={(value as string[]) ?? []} onChange={onChange} placeholder={field.placeholder} />
      )}
      {field.hint && <p className="mt-1 text-[10px] text-zinc-600">{field.hint}</p>}
    </div>
  )
}

function TagsInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[]
  onChange: (v: unknown) => void
  placeholder?: string
}) {
  const [input, setInput] = useState('')

  const add = (raw: string) => {
    const items = raw.split(',').map((s) => s.trim()).filter(Boolean)
    if (items.length === 0) return
    const next = Array.from(new Set([...value, ...items]))
    onChange(next)
    setInput('')
  }

  const remove = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i))
  }

  return (
    <div className="rounded-lg border border-dark-500 bg-dark-700 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="group/tag inline-flex items-center gap-1 rounded-md bg-lime-500/15 px-2 py-0.5 text-[11px] text-lime-300"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-lime-300/60 hover:text-lime-200"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(input)
            } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
              remove(value.length - 1)
            }
          }}
          onBlur={() => input && add(input)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 bg-transparent px-1 py-0.5 text-[12px] text-white placeholder-zinc-600 outline-none"
        />
      </div>
    </div>
  )
}
