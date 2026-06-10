// ============================================================
//  CELURA · Página de Flujos (Workflows)
//  Lista, crea, edita y simula workflows del clinic.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import {
  Workflow as WorkflowIcon, Plus, Trash2, ArrowLeft, Save,
  ToggleLeft, ToggleRight, Sparkles, AlertTriangle, CheckCircle2,
  Copy, Zap,
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/lib/api'
import WorkflowEditor from '@/components/workflow/WorkflowEditor'
import WorkflowSimulator from '@/components/workflow/WorkflowSimulator'
import { TEMPLATES, type WorkflowTemplate } from '@/lib/workflow-templates'
import type { Workflow, WorkflowGraph } from '@/lib/workflow-types'

type View = 'list' | 'edit'

export default function WorkflowsPage() {
  const [view, setView] = useState<View>('list')
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Workflow | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await api.get<{ workflows: Workflow[] }>('/api/workflows')
    if (err) setError(err)
    else setWorkflows(data?.workflows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const openNew = () => {
    setEditing({
      id: '',
      clinic_id: '',
      name: 'Nuevo flujo',
      description: '',
      enabled: true,
      priority: 50,
      graph: { trigger: null, blocks: {} },
      runs_total: 0,
      runs_matched: 0,
      last_run_at: null,
      created_at: '',
      updated_at: '',
    })
    setView('edit')
  }

  const openTemplate = (t: WorkflowTemplate) => {
    setEditing({
      id: '',
      clinic_id: '',
      name: t.name,
      description: t.description,
      enabled: true,
      priority: t.priority,
      graph: t.build(),
      runs_total: 0,
      runs_matched: 0,
      last_run_at: null,
      created_at: '',
      updated_at: '',
    })
    setView('edit')
  }

  const openEdit = (w: Workflow) => {
    setEditing({ ...w })
    setView('edit')
  }

  const backToList = async () => {
    setView('list')
    setEditing(null)
    await load()
  }

  const toggleEnabled = async (w: Workflow) => {
    const prev = workflows
    setWorkflows((ws) => ws.map((x) => (x.id === w.id ? { ...x, enabled: !x.enabled } : x)))
    const { error: err } = await api.patch(`/api/workflows/${w.id}`, { enabled: !w.enabled })
    if (err) {
      setWorkflows(prev)
      setError(err)
    }
  }

  const duplicateWorkflow = async (w: Workflow) => {
    const payload = {
      name: `${w.name} (copia)`,
      description: w.description,
      enabled: false,
      priority: w.priority,
      graph: w.graph,
    }
    const { error: err } = await api.post('/api/workflows', payload)
    if (err) setError(err)
    else await load()
  }

  const deleteWorkflow = async (w: Workflow) => {
    if (!confirm(`¿Eliminar el flujo "${w.name}"? No se puede deshacer.`)) return
    const { error: err } = await api.delete(`/api/workflows/${w.id}`)
    if (err) setError(err)
    else await load()
  }

  if (view === 'edit' && editing) {
    return (
      <WorkflowEditorView
        workflow={editing}
        allWorkflows={workflows}
        onBack={backToList}
      />
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Flujos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Automatiza cómo responde tu asistente con bloques visuales. Cada flujo
            decide qué hacer cuando ocurre algo en una conversación.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-lime-500 px-4 py-2.5 text-sm font-semibold text-dark-900 transition-colors hover:bg-lime-400"
        >
          <Plus className="h-4 w-4" />
          Nuevo flujo
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          <AlertTriangle className="h-4 w-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-200">
            ×
          </button>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="mt-10 text-center text-sm text-zinc-500">Cargando flujos…</div>
      ) : workflows.length === 0 ? (
        <EmptyState onPickTemplate={openTemplate} onNew={openNew} />
      ) : (
        <>
          <div className="mt-6 grid gap-3">
            {workflows.map((w) => (
              <WorkflowCard
                key={w.id}
                workflow={w}
                onEdit={() => openEdit(w)}
                onToggle={() => toggleEnabled(w)}
                onDuplicate={() => duplicateWorkflow(w)}
                onDelete={() => deleteWorkflow(w)}
              />
            ))}
          </div>

          {/* Plantillas (siempre visibles abajo) */}
          <div className="mt-10">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-lime-400" />
              <h2 className="text-sm font-semibold text-white">Plantillas listas para usar</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <TemplateCard key={t.key} template={t} onPick={() => openTemplate(t)} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Lista: tarjeta de workflow ──────────────────────────────
function WorkflowCard({
  workflow, onEdit, onToggle, onDuplicate, onDelete,
}: {
  workflow: Workflow
  onEdit: () => void
  onToggle: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const blockCount = Object.keys(workflow.graph.blocks).length
  return (
    <div className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-dark-800 px-4 py-3 transition-all hover:border-lime-500/20">
      <button
        onClick={onToggle}
        title={workflow.enabled ? 'Desactivar' : 'Activar'}
        className="shrink-0"
      >
        {workflow.enabled ? (
          <ToggleRight className="h-7 w-7 text-lime-400" />
        ) : (
          <ToggleLeft className="h-7 w-7 text-zinc-600" />
        )}
      </button>

      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-white">{workflow.name}</h3>
          <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            P{workflow.priority}
          </span>
          {!workflow.enabled && (
            <span className="rounded-md bg-zinc-700/40 px-1.5 py-0.5 text-[10px] text-zinc-500">
              Pausado
            </span>
          )}
        </div>
        {workflow.description && (
          <p className="mt-0.5 truncate text-[12px] text-zinc-500">{workflow.description}</p>
        )}
        <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-600">
          <span>{blockCount} bloque{blockCount === 1 ? '' : 's'}</span>
          <span>•</span>
          <span>{workflow.runs_matched}/{workflow.runs_total} activaciones</span>
          {workflow.last_run_at && (
            <>
              <span>•</span>
              <span>último: {new Date(workflow.last_run_at).toLocaleDateString()}</span>
            </>
          )}
        </div>
      </button>

      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onDuplicate}
          title="Duplicar"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.05] hover:text-white"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          title="Eliminar"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Tarjeta de plantilla ────────────────────────────────────
function TemplateCard({ template, onPick }: { template: WorkflowTemplate; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-dark-800/60 px-4 py-3 text-left transition-all hover:border-lime-500/30 hover:bg-dark-800"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-lime-500/10 text-xl">
        {template.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{template.name}</p>
        <p className="mt-0.5 line-clamp-2 text-[12px] text-zinc-500">{template.description}</p>
      </div>
      <Plus className="h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-lime-400" />
    </button>
  )
}

// ── Estado vacío ────────────────────────────────────────────
function EmptyState({
  onPickTemplate, onNew,
}: { onPickTemplate: (t: WorkflowTemplate) => void; onNew: () => void }) {
  return (
    <div className="mt-8">
      <div className="rounded-2xl border border-dashed border-white/[0.08] bg-dark-800/40 p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-500/10">
          <WorkflowIcon className="h-6 w-6 text-lime-400" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-white">Empieza con una plantilla</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Flujos listos que ya funcionan. Tómalos como están o ajústalos a tu clínica.
        </p>
        <button
          onClick={onNew}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-dark-700 px-4 py-2 text-sm text-zinc-300 hover:bg-dark-600"
        >
          <Plus className="h-3.5 w-3.5" />
          O crear uno desde cero
        </button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <TemplateCard key={t.key} template={t} onPick={() => onPickTemplate(t)} />
        ))}
      </div>
    </div>
  )
}

// ── Vista de edición ────────────────────────────────────────
function WorkflowEditorView({
  workflow, allWorkflows, onBack,
}: { workflow: Workflow; allWorkflows: Workflow[]; onBack: () => void }) {
  const [w, setW] = useState<Workflow>(workflow)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const isNew = !workflow.id

  const setGraph = (graph: WorkflowGraph) => setW((p) => ({ ...p, graph }))

  const validation = useMemo(() => validateLocal(w), [w])

  const save = async () => {
    if (!w.name.trim()) {
      setSaveError('Ponle un nombre al flujo')
      return
    }
    setSaving(true)
    setSaveError(null)
    const payload = {
      name: w.name.trim(),
      description: w.description,
      enabled: w.enabled,
      priority: w.priority,
      graph: w.graph,
    }
    const res = isNew
      ? await api.post<{ workflow: Workflow }>('/api/workflows', payload)
      : await api.patch<{ workflow: Workflow }>(`/api/workflows/${w.id}`, payload)
    setSaving(false)
    if (res.error) {
      setSaveError(res.error)
    } else if (res.data?.workflow) {
      setW(res.data.workflow)
      setSavedAt(Date.now())
      if (isNew) {
        setTimeout(() => onBack(), 700)
      }
    }
  }

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-dark-900/80 px-6 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/[0.05] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <input
            type="text"
            value={w.name}
            onChange={(e) => setW({ ...w, name: e.target.value })}
            placeholder="Nombre del flujo"
            className="min-w-0 max-w-md flex-1 bg-transparent text-lg font-semibold text-white outline-none placeholder:text-zinc-600"
          />
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <label>Prioridad</label>
            <input
              type="number"
              min={0}
              max={100}
              value={w.priority}
              onChange={(e) => setW({ ...w, priority: Number(e.target.value) || 0 })}
              className="w-16 rounded-md border border-dark-500 bg-dark-700 px-2 py-0.5 text-center text-white outline-none focus:border-lime-500/40"
            />
          </div>
          <button
            onClick={() => setW({ ...w, enabled: !w.enabled })}
            className={clsx(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium',
              w.enabled
                ? 'bg-lime-500/15 text-lime-300'
                : 'bg-zinc-700/40 text-zinc-500',
            )}
          >
            <Zap className="h-3 w-3" />
            {w.enabled ? 'Activo' : 'Pausado'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          {validation.errors.length > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              {validation.errors.length} problema{validation.errors.length === 1 ? '' : 's'}
            </span>
          )}
          {savedAt && Date.now() - savedAt < 3000 && (
            <span className="flex items-center gap-1 text-[11px] text-lime-400">
              <CheckCircle2 className="h-3 w-3" />
              Guardado
            </span>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-lime-500 px-4 py-1.5 text-[13px] font-semibold text-dark-900 transition-colors hover:bg-lime-400 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Descripción inline */}
      <div className="border-b border-white/[0.06] bg-dark-900/40 px-6 py-2">
        <input
          type="text"
          value={w.description}
          onChange={(e) => setW({ ...w, description: e.target.value })}
          placeholder="Descripción corta del flujo (opcional)"
          className="w-full bg-transparent text-[12px] text-zinc-400 outline-none placeholder:text-zinc-600"
        />
      </div>

      {saveError && (
        <div className="mx-6 mt-3 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          <AlertTriangle className="h-4 w-4" />
          {saveError}
        </div>
      )}

      {/* Workspace: editor + simulador */}
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_380px]">
        <div className="overflow-y-auto rounded-2xl border border-white/[0.06] bg-dark-800/40 p-6">
          <WorkflowEditor graph={w.graph} onChange={setGraph} />
        </div>
        <div className="overflow-hidden">
          <WorkflowSimulator
            workflows={allWorkflows.filter((x) => x.id !== w.id)}
            active={w.graph}
            activeName={w.name}
          />
        </div>
      </div>
    </div>
  )
}

// ── validación local ────────────────────────────────────────
function validateLocal(w: Workflow): { errors: string[] } {
  const errors: string[] = []
  if (!w.graph.trigger) errors.push('Sin disparador')
  for (const b of Object.values(w.graph.blocks)) {
    if (b.next && !w.graph.blocks[b.next]) errors.push(`Bloque ${b.id}: next inválido`)
    if (b.kind === 'condition' && b.next_else && !w.graph.blocks[b.next_else]) {
      errors.push(`Bloque ${b.id}: rama "no" inválida`)
    }
  }
  return { errors }
}
