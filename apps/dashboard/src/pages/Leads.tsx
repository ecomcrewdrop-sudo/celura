// ============================================================
//  CELURA · Pagina Leads (CRM)
//  - Stats hero, pipeline visual con conteos
//  - 2 vistas: Lista compacta / Kanban por etapa
//  - Filtros chip (stage + urgency), busqueda, sort
//  - Modal detalle con edicion inline (nombre, email, ciudad,
//    notas, tratamiento, urgencia, etapa) + quick actions
// ============================================================

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import Input from '@/components/Input'
import {
  Search,
  Plus,
  Phone,
  Mail,
  MessageCircle,
  MapPin,
  Calendar as CalendarIcon,
  TrendingUp,
  Users,
  Flame,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Save,
  X as XIcon,
  Copy,
  Check,
  LayoutList,
  Columns3,
  FileText,
  Sparkles,
  Stethoscope,
  ChevronDown,
  Clock,
  ArrowUpDown,
} from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────
interface Lead {
  id: string
  name: string | null
  phone: string
  email: string | null
  city: string | null
  stage: string
  score: number
  urgency_level: string
  treatment_interest: string | null
  notes: string | null
  source: string
  first_contact_at: string | null
  last_message_at: string | null
  created_at: string
}

type ViewMode = 'list' | 'kanban'
type SortMode = 'recent' | 'score' | 'oldest'

// ── Etapas con meta visual ───────────────────────────────────
const STAGES = ['new', 'contacted', 'warm', 'interested', 'scheduled', 'attended', 'recurring', 'lost'] as const

const STAGE_META: Record<
  string,
  {
    label: string
    short: string
    dot: string         // bg-color del avatar / dot
    text: string        // text-color matching
    ring: string        // ring matching
    chipBg: string      // chip activo bg
    chipText: string    // chip activo text
    chipRing: string    // chip activo ring
    cardBorder: string  // borde card kanban
    pipeBg: string      // segment de pipeline
    pipeText: string    // texto segment pipeline
  }
> = {
  new: {
    label: 'Nuevo', short: 'Nuevo',
    dot: 'bg-sky-400', text: 'text-sky-400', ring: 'ring-sky-500/30',
    chipBg: 'bg-sky-500/15', chipText: 'text-sky-400', chipRing: 'ring-sky-500/30',
    cardBorder: 'border-l-sky-500/60', pipeBg: 'bg-sky-500/15', pipeText: 'text-sky-400',
  },
  contacted: {
    label: 'Contactado', short: 'Contact.',
    dot: 'bg-blue-400', text: 'text-blue-400', ring: 'ring-blue-500/30',
    chipBg: 'bg-blue-500/15', chipText: 'text-blue-400', chipRing: 'ring-blue-500/30',
    cardBorder: 'border-l-blue-500/60', pipeBg: 'bg-blue-500/15', pipeText: 'text-blue-400',
  },
  warm: {
    label: 'Tibio', short: 'Tibio',
    dot: 'bg-amber-400', text: 'text-amber-400', ring: 'ring-amber-500/30',
    chipBg: 'bg-amber-500/15', chipText: 'text-amber-400', chipRing: 'ring-amber-500/30',
    cardBorder: 'border-l-amber-500/60', pipeBg: 'bg-amber-500/15', pipeText: 'text-amber-400',
  },
  interested: {
    label: 'Interesado', short: 'Interes.',
    dot: 'bg-purple-400', text: 'text-purple-400', ring: 'ring-purple-500/30',
    chipBg: 'bg-purple-500/15', chipText: 'text-purple-400', chipRing: 'ring-purple-500/30',
    cardBorder: 'border-l-purple-500/60', pipeBg: 'bg-purple-500/15', pipeText: 'text-purple-400',
  },
  scheduled: {
    label: 'Agendado', short: 'Agend.',
    dot: 'bg-emerald-400', text: 'text-emerald-400', ring: 'ring-emerald-500/30',
    chipBg: 'bg-emerald-500/15', chipText: 'text-emerald-400', chipRing: 'ring-emerald-500/30',
    cardBorder: 'border-l-emerald-500/60', pipeBg: 'bg-emerald-500/15', pipeText: 'text-emerald-400',
  },
  attended: {
    label: 'Atendido', short: 'Atend.',
    dot: 'bg-lime-400', text: 'text-lime-400', ring: 'ring-lime-500/30',
    chipBg: 'bg-lime-500/15', chipText: 'text-lime-400', chipRing: 'ring-lime-500/30',
    cardBorder: 'border-l-lime-500/60', pipeBg: 'bg-lime-500/15', pipeText: 'text-lime-400',
  },
  recurring: {
    label: 'Recurrente', short: 'Recur.',
    dot: 'bg-teal-400', text: 'text-teal-400', ring: 'ring-teal-500/30',
    chipBg: 'bg-teal-500/15', chipText: 'text-teal-400', chipRing: 'ring-teal-500/30',
    cardBorder: 'border-l-teal-500/60', pipeBg: 'bg-teal-500/15', pipeText: 'text-teal-400',
  },
  lost: {
    label: 'Perdido', short: 'Perdido',
    dot: 'bg-red-400', text: 'text-red-400', ring: 'ring-red-500/30',
    chipBg: 'bg-red-500/15', chipText: 'text-red-400', chipRing: 'ring-red-500/30',
    cardBorder: 'border-l-red-500/60', pipeBg: 'bg-red-500/15', pipeText: 'text-red-400',
  },
}

const URGENCIES = ['low', 'medium', 'high', 'emergency'] as const
const URGENCY_LABELS: Record<string, string> = {
  low: 'Baja', medium: 'Media', high: 'Alta', emergency: 'Emergencia',
}

// ── Helpers ──────────────────────────────────────────────────
const initials = (name: string | null | undefined, phone: string): string => {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/)
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
  }
  return phone.slice(-2)
}

const formatRelative = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const day = Math.floor(h / 24)
  if (day < 7) return `hace ${day} d`
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

const scoreColor = (score: number): { color: string; label: string } => {
  if (score >= 75) return { color: 'text-lime-400', label: 'Caliente' }
  if (score >= 50) return { color: 'text-amber-400', label: 'Tibio' }
  if (score >= 25) return { color: 'text-sky-400', label: 'Frío' }
  return { color: 'text-zinc-500', label: 'Sin scorear' }
}

// ── Componente principal ─────────────────────────────────────
export default function Leads() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('')
  const [urgencyFilter, setUrgencyFilter] = useState<string>('')
  const [sort, setSort] = useState<SortMode>('recent')
  const [view, setView] = useState<ViewMode>('list')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showSortMenu, setShowSortMenu] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce de busqueda
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // Fetch
  const fetchLeads = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '200', order: sort })
    // El backend exige caracteres validos para search; ya filtramos en frontend
    if (debouncedSearch && /^[\p{L}\p{N}\s@+\-]+$/u.test(debouncedSearch)) {
      params.set('search', debouncedSearch)
    }
    if (stageFilter) params.set('stage', stageFilter)
    if (urgencyFilter) params.set('urgency', urgencyFilter)
    const res = await api.get<{ leads: Lead[]; total: number }>(`/api/leads?${params}`)
    if (res.data) {
      setLeads(res.data.leads)
      setTotal(res.data.total)
    }
    setLoading(false)
  }, [debouncedSearch, stageFilter, urgencyFilter, sort])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // ── Stats hero ──────────────────────────────────────────
  const stats = useMemo(() => {
    const now = Date.now()
    const week = 7 * 86_400_000
    let newThisWeek = 0
    let hotLeads = 0
    let scheduled = 0
    let attended = 0
    leads.forEach((l) => {
      if (l.created_at && now - new Date(l.created_at).getTime() < week) newThisWeek++
      if (l.score >= 75) hotLeads++
      if (l.stage === 'scheduled') scheduled++
      if (l.stage === 'attended' || l.stage === 'recurring') attended++
    })
    const totalScored = leads.filter((l) => l.stage !== 'lost').length
    const conversionRate = totalScored > 0 ? Math.round((attended / leads.length) * 100) : null
    return { newThisWeek, hotLeads, scheduled, conversionRate }
  }, [leads])

  // Contadores por stage para pipeline
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    STAGES.forEach((s) => (counts[s] = 0))
    leads.forEach((l) => {
      counts[l.stage] = (counts[l.stage] ?? 0) + 1
    })
    return counts
  }, [leads])

  // ── Acciones ────────────────────────────────────────────
  const handleStageUpdate = async (id: string, stage: string) => {
    await api.patch(`/api/leads/${id}`, { stage })
    if (selected?.id === id) setSelected({ ...selected, stage })
    fetchLeads()
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Leads"
        subtitle={`${total} pacientes · ${stats.hotLeads} calientes · ${stats.scheduled} agendados`}
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Nuevo lead
          </Button>
        }
      />

      {/* ═══ Stats hero ═══ */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Total pipeline"
          value={total}
          color="sky"
        />
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          label="Nuevos (7 días)"
          value={stats.newThisWeek}
          color="lime"
        />
        <StatCard
          icon={<Flame className="h-4 w-4" />}
          label="Leads calientes"
          value={stats.hotLeads}
          color="amber"
          hint="Score ≥ 75"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Conversión"
          value={stats.conversionRate !== null ? `${stats.conversionRate}%` : '—'}
          color={stats.conversionRate === null ? 'zinc' : stats.conversionRate >= 30 ? 'lime' : 'amber'}
          hint="Atendidos / total"
        />
      </div>

      {/* ═══ Pipeline funnel ═══ */}
      <Card className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Pipeline</h3>
            <p className="text-[11.5px] text-zinc-500">Clic para filtrar · doble clic para limpiar</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {STAGES.map((s) => {
            const meta = STAGE_META[s]!
            const count = stageCounts[s] ?? 0
            const active = stageFilter === s
            return (
              <button
                key={s}
                onClick={() => setStageFilter(active ? '' : s)}
                className={`group relative rounded-xl p-2.5 text-left transition-all ${
                  active
                    ? `${meta.pipeBg} ring-1 ${meta.ring}`
                    : 'bg-dark-900/50 hover:bg-dark-900/80'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  <span className={`text-[10.5px] font-medium uppercase tracking-wider ${active ? meta.pipeText : 'text-zinc-500'}`}>
                    {meta.short}
                  </span>
                </div>
                <div className={`mt-1.5 text-2xl font-bold ${active ? meta.pipeText : 'text-white'}`}>
                  {count}
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {/* ═══ Toolbar ═══ */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Vista + Sort */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-dark-600 bg-dark-800 p-1">
            <ViewTab active={view === 'list'} onClick={() => setView('list')} icon={<LayoutList className="h-3.5 w-3.5" />}>
              Lista
            </ViewTab>
            <ViewTab active={view === 'kanban'} onClick={() => setView('kanban')} icon={<Columns3 className="h-3.5 w-3.5" />}>
              Kanban
            </ViewTab>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dark-600 bg-dark-800 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-dark-700"
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-zinc-500" />
              {sort === 'recent' ? 'Recientes' : sort === 'score' ? 'Mejor score' : 'Antiguos'}
              <ChevronDown className="h-3 w-3 text-zinc-500" />
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-dark-500 bg-dark-800 shadow-xl">
                  {(['recent', 'score', 'oldest'] as SortMode[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => { setSort(s); setShowSortMenu(false) }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-dark-700 ${
                        sort === s ? 'text-lime-400' : 'text-zinc-300'
                      }`}
                    >
                      {s === 'recent' && 'Mensaje más reciente'}
                      {s === 'score' && 'Mayor score primero'}
                      {s === 'oldest' && 'Más antiguos primero'}
                      {sort === s && <Check className="h-3 w-3" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono…"
            className="w-full rounded-lg border border-dark-600 bg-dark-800 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-lime-500/40"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:text-white"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ═══ Chips urgencia ═══ */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">Urgencia:</span>
        <FilterChip active={urgencyFilter === ''} onClick={() => setUrgencyFilter('')}>
          Todas
        </FilterChip>
        {URGENCIES.map((u) => (
          <FilterChip
            key={u}
            active={urgencyFilter === u}
            onClick={() => setUrgencyFilter(urgencyFilter === u ? '' : u)}
            tone={u === 'high' || u === 'emergency' ? 'red' : u === 'medium' ? 'amber' : 'zinc'}
          >
            {URGENCY_LABELS[u]}
          </FilterChip>
        ))}
        {(stageFilter || urgencyFilter || debouncedSearch) && (
          <button
            onClick={() => { setStageFilter(''); setUrgencyFilter(''); setSearch('') }}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-zinc-500 hover:bg-dark-700 hover:text-white"
          >
            <XIcon className="h-3 w-3" /> Limpiar filtros
          </button>
        )}
      </div>

      {/* ═══ Contenido ═══ */}
      {loading ? (
        <LoadingState />
      ) : leads.length === 0 ? (
        <EmptyState clearAll={!!(stageFilter || urgencyFilter || debouncedSearch)} onClear={() => {
          setStageFilter(''); setUrgencyFilter(''); setSearch('')
        }} />
      ) : view === 'list' ? (
        <ListView
          leads={leads}
          onSelect={setSelected}
          onStageChange={handleStageUpdate}
        />
      ) : (
        <KanbanView
          leads={leads}
          onSelect={setSelected}
          onStageChange={handleStageUpdate}
        />
      )}

      {/* ═══ Modales ═══ */}
      {selected && (
        <DetailModal
          lead={selected}
          onClose={() => setSelected(null)}
          onUpdate={async (patch) => {
            const r = await api.patch<{ lead: Lead }>(`/api/leads/${selected.id}`, patch)
            if (r.data?.lead) {
              setSelected(r.data.lead)
              fetchLeads()
            }
          }}
          onStageChange={(s) => handleStageUpdate(selected.id, s)}
          onOpenConversation={() => {
            setSelected(null)
            navigate(`/conversaciones?lead=${selected.id}`)
          }}
        />
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchLeads() }}
        />
      )}
    </div>
  )
}

// ============================================================
//  StatCard
// ============================================================
function StatCard({
  icon, label, value, color = 'lime', hint,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  color?: 'lime' | 'sky' | 'amber' | 'red' | 'zinc'
  hint?: string
}) {
  const colors = {
    lime: 'text-lime-400 bg-lime-500/10 ring-lime-500/20',
    sky: 'text-sky-300 bg-sky-500/10 ring-sky-500/20',
    amber: 'text-amber-300 bg-amber-500/10 ring-amber-500/20',
    red: 'text-red-400 bg-red-500/10 ring-red-500/20',
    zinc: 'text-zinc-400 bg-dark-600 ring-white/[0.04]',
  }
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-white">{value}</p>
          {hint && <p className="mt-0.5 truncate text-[11px] text-zinc-500">{hint}</p>}
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${colors[color]}`}>
          {icon}
        </div>
      </div>
    </Card>
  )
}

function ViewTab({
  active, onClick, children, icon,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'bg-lime-500/15 text-lime-400' : 'text-zinc-400 hover:text-white'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function FilterChip({
  active, onClick, children, tone = 'zinc',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  tone?: 'zinc' | 'amber' | 'red' | 'lime'
}) {
  const tones = {
    zinc: 'bg-lime-500/15 text-lime-400 ring-lime-500/30',
    amber: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
    red: 'bg-red-500/15 text-red-400 ring-red-500/30',
    lime: 'bg-lime-500/15 text-lime-400 ring-lime-500/30',
  }
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? `${tones[tone]} ring-1` : 'text-zinc-400 hover:bg-dark-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

// ============================================================
//  ListView
// ============================================================
function ListView({
  leads, onSelect, onStageChange,
}: {
  leads: Lead[]
  onSelect: (l: Lead) => void
  onStageChange: (id: string, stage: string) => void
}) {
  return (
    <Card className="p-0">
      <div className="divide-y divide-dark-600">
        {leads.map((lead) => (
          <LeadRow key={lead.id} lead={lead} onClick={() => onSelect(lead)} onStageChange={onStageChange} />
        ))}
      </div>
    </Card>
  )
}

function LeadRow({
  lead, onClick, onStageChange,
}: {
  lead: Lead
  onClick: () => void
  onStageChange: (id: string, stage: string) => void
}) {
  const meta = STAGE_META[lead.stage] ?? STAGE_META.new!
  const sc = scoreColor(lead.score)
  const navigate = useNavigate()
  const isUrgent = lead.urgency_level === 'high' || lead.urgency_level === 'emergency'
  const [copied, setCopied] = useState(false)

  const copyPhone = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(lead.phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const openConvo = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(`/conversaciones?lead=${lead.id}`)
  }

  return (
    <div
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-4 px-5 py-3.5 transition-colors hover:bg-dark-700/40"
    >
      {/* Avatar con color de etapa */}
      <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-dark-700 text-sm font-bold text-white ring-1 ${meta.ring}`}>
        {initials(lead.name, lead.phone)}
        <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-dark-800 ${meta.dot}`} />
      </div>

      {/* Info principal */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-white">
            {lead.name ?? <span className="text-zinc-400">Sin nombre</span>}
          </p>
          {isUrgent && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400 ring-1 ring-red-500/20">
              <AlertCircle className="h-2.5 w-2.5" /> {URGENCY_LABELS[lead.urgency_level]}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-zinc-500">
          <span className="font-mono">{lead.phone}</span>
          {lead.treatment_interest && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="inline-flex items-center gap-1 truncate">
                <Stethoscope className="h-3 w-3" /> {lead.treatment_interest}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Score circular */}
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <ScoreRing score={lead.score} />
        <div className="hidden text-right md:block">
          <div className={`text-[11px] font-semibold ${sc.color}`}>{sc.label}</div>
          <div className="text-[10.5px] text-zinc-500">{formatRelative(lead.last_message_at)}</div>
        </div>
      </div>

      {/* Score compacto en móvil */}
      <div className={`flex shrink-0 flex-col items-end sm:hidden`}>
        <span className={`text-sm font-bold ${sc.color}`}>{lead.score}</span>
        <span className="text-[10px] text-zinc-500">{formatRelative(lead.last_message_at)}</span>
      </div>

      {/* Stage badge */}
      <div className="hidden shrink-0 sm:block">
        <Badge stage={lead.stage}>{STAGE_META[lead.stage]?.label ?? lead.stage}</Badge>
      </div>

      {/* Quick actions */}
      <div className="hidden gap-1 opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
        <button
          onClick={openConvo}
          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-lime-500/15 hover:text-lime-400"
          title="Ver conversación"
        >
          <MessageCircle className="h-4 w-4" />
        </button>
        <button
          onClick={copyPhone}
          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-sky-500/15 hover:text-sky-400"
          title="Copiar teléfono"
        >
          {copied ? <Check className="h-4 w-4 text-lime-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      {/* Quick stage selector */}
      <StageQuickSelect
        current={lead.stage}
        onChange={(s) => onStageChange(lead.id, s)}
      />
    </div>
  )
}

function StageQuickSelect({
  current, onChange,
}: {
  current: string
  onChange: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-dark-600 hover:text-white"
        title="Cambiar etapa"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-dark-500 bg-dark-800 shadow-xl">
            {STAGES.map((s) => {
              const meta = STAGE_META[s]!
              return (
                <button
                  key={s}
                  onClick={(e) => { e.stopPropagation(); onChange(s); setOpen(false) }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-dark-700 ${
                    current === s ? meta.text : 'text-zinc-300'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                  {current === s && <Check className="ml-auto h-3 w-3" />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const r = 14
  const c = 2 * Math.PI * r
  const dash = (score / 100) * c
  const sc = scoreColor(score)
  return (
    <div className="relative h-9 w-9">
      <svg className="h-9 w-9 -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={r} fill="none" stroke="rgb(63 63 70 / 0.4)" strokeWidth="3" />
        <circle
          cx="18" cy="18" r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className={sc.color}
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${sc.color}`}>
        {score}
      </div>
    </div>
  )
}

// ============================================================
//  KanbanView
// ============================================================
function KanbanView({
  leads, onSelect, onStageChange,
}: {
  leads: Lead[]
  onSelect: (l: Lead) => void
  onStageChange: (id: string, stage: string) => void
}) {
  const byStage = useMemo(() => {
    const map = new Map<string, Lead[]>()
    STAGES.forEach((s) => map.set(s, []))
    leads.forEach((l) => {
      const arr = map.get(l.stage) ?? map.get('new')!
      arr.push(l)
    })
    return map
  }, [leads])

  // Mostramos solo las etapas con leads o las clave para no saturar
  const visibleStages = STAGES.filter((s) => (byStage.get(s)?.length ?? 0) > 0 || s !== 'lost')

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[1100px] grid-cols-8 gap-2.5">
        {visibleStages.map((s) => {
          const meta = STAGE_META[s]!
          const items = byStage.get(s) ?? []
          return (
            <div key={s} className="flex flex-col">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${meta.text}`}>
                    {meta.short}
                  </span>
                </div>
                <span className="rounded-full bg-dark-700 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                  {items.length}
                </span>
              </div>
              <div className="flex-1 space-y-1.5 rounded-xl bg-dark-900/40 p-1.5">
                {items.length === 0 ? (
                  <div className="py-6 text-center text-[10.5px] text-zinc-600">Vacío</div>
                ) : (
                  items.map((lead) => (
                    <KanbanCard
                      key={lead.id}
                      lead={lead}
                      meta={meta}
                      onClick={() => onSelect(lead)}
                      onStageChange={onStageChange}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KanbanCard({
  lead, meta, onClick, onStageChange,
}: {
  lead: Lead
  meta: typeof STAGE_META[string]
  onClick: () => void
  onStageChange: (id: string, stage: string) => void
}) {
  const isUrgent = lead.urgency_level === 'high' || lead.urgency_level === 'emergency'
  return (
    <div
      onClick={onClick}
      className={`group cursor-pointer rounded-lg border-l-2 bg-dark-800 p-2.5 transition-all hover:bg-dark-700 ${meta.cardBorder}`}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="truncate text-[12.5px] font-medium text-white">
          {lead.name ?? <span className="text-zinc-500">Sin nombre</span>}
        </p>
        <ScoreRing score={lead.score} />
      </div>
      <p className="truncate font-mono text-[10.5px] text-zinc-500">{lead.phone}</p>
      {lead.treatment_interest && (
        <p className="mt-1 line-clamp-2 text-[11px] text-zinc-400">{lead.treatment_interest}</p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-zinc-600">{formatRelative(lead.last_message_at)}</span>
        {isUrgent && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9.5px] font-medium text-red-400">
            <AlertCircle className="h-2 w-2" /> {URGENCY_LABELS[lead.urgency_level]}
          </span>
        )}
      </div>
      <div className="mt-1.5 -mb-0.5 flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        <StageQuickSelect current={lead.stage} onChange={(s) => onStageChange(lead.id, s)} />
      </div>
    </div>
  )
}

// ============================================================
//  Empty + Loading
// ============================================================
function LoadingState() {
  return (
    <Card>
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" />
      </div>
    </Card>
  )
}

function EmptyState({ clearAll, onClear }: { clearAll: boolean; onClear: () => void }) {
  return (
    <Card>
      <div className="py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-700">
          <Users className="h-7 w-7 text-zinc-500" />
        </div>
        <p className="text-sm font-medium text-zinc-300">
          {clearAll ? 'No hay resultados con esos filtros' : 'Aún no hay leads'}
        </p>
        <p className="mt-1 text-[12.5px] text-zinc-500">
          {clearAll
            ? 'Probá limpiando filtros o ajustando la búsqueda.'
            : 'Cuando un paciente escriba al WhatsApp, aparecerá acá automáticamente.'}
        </p>
        {clearAll && (
          <button onClick={onClear} className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-lime-400 hover:text-lime-300">
            <XIcon className="h-3 w-3" /> Limpiar filtros
          </button>
        )}
      </div>
    </Card>
  )
}

// ============================================================
//  DetailModal con edicion inline
// ============================================================
function DetailModal({
  lead, onClose, onUpdate, onStageChange, onOpenConversation,
}: {
  lead: Lead
  onClose: () => void
  onUpdate: (patch: Partial<Lead>) => Promise<void>
  onStageChange: (s: string) => void
  onOpenConversation: () => void
}) {
  const meta = STAGE_META[lead.stage] ?? STAGE_META.new!
  const sc = scoreColor(lead.score)
  const [copiedPhone, setCopiedPhone] = useState(false)

  // Estado de edicion por campo
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Lead>>({})
  const [saving, setSaving] = useState(false)

  const startEdit = (field: keyof Lead) => {
    setDraft({ [field]: lead[field] })
    setEditing(field as string)
  }
  const cancelEdit = () => { setDraft({}); setEditing(null) }
  const saveEdit = async () => {
    setSaving(true)
    await onUpdate(draft)
    setSaving(false)
    setEditing(null)
    setDraft({})
  }

  const copyPhone = async () => {
    await navigator.clipboard.writeText(lead.phone)
    setCopiedPhone(true)
    setTimeout(() => setCopiedPhone(false), 1500)
  }

  return (
    <Modal open={true} onClose={onClose} title="Detalle del lead">
      <div className="space-y-4">
        {/* Hero */}
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-dark-900/40 p-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-dark-700 text-sm font-bold text-white ring-1 ${meta.ring}`}>
            {initials(lead.name, lead.phone)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {editing === 'name' ? (
                <InlineEditField
                  value={String(draft.name ?? lead.name ?? '')}
                  placeholder="Nombre del paciente"
                  onChange={(v) => setDraft({ ...draft, name: v || null })}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                  saving={saving}
                />
              ) : (
                <>
                  <h3 className="truncate text-base font-semibold text-white">
                    {lead.name ?? <span className="text-zinc-500">Sin nombre</span>}
                  </h3>
                  <button onClick={() => startEdit('name')} className="text-zinc-500 hover:text-white">
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-zinc-500">
              <Phone className="h-3 w-3" />
              <span className="font-mono">{lead.phone}</span>
              <button onClick={copyPhone} className="text-zinc-500 hover:text-lime-400">
                {copiedPhone ? <Check className="h-3 w-3 text-lime-400" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <ScoreRing score={lead.score} />
            <span className={`mt-0.5 text-[10px] font-medium ${sc.color}`}>{sc.label}</span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-2">
          <QuickAction
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            label="Conversación"
            onClick={onOpenConversation}
            primary
          />
          <a
            href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-dark-400 hover:bg-dark-600"
          >
            <Phone className="h-3.5 w-3.5" /> WhatsApp
          </a>
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-dark-400 hover:bg-dark-600"
            >
              <Mail className="h-3.5 w-3.5" /> Email
            </a>
          )}
          {!lead.email && (
            <button
              onClick={() => startEdit('email')}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-dark-500 bg-dark-800 px-3 py-2 text-xs font-medium text-zinc-500 transition hover:border-lime-500/40 hover:text-lime-400"
            >
              <Plus className="h-3.5 w-3.5" /> Email
            </button>
          )}
        </div>

        {/* Pipeline visual con etapa actual */}
        <div>
          <p className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wider text-zinc-500">Etapa</p>
          <div className="flex flex-wrap gap-1">
            {STAGES.map((s) => {
              const m = STAGE_META[s]!
              const active = lead.stage === s
              return (
                <button
                  key={s}
                  onClick={() => onStageChange(s)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                    active
                      ? `${m.chipBg} ${m.chipText} ring-1 ${m.chipRing}`
                      : 'text-zinc-400 hover:bg-dark-700 hover:text-white'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Campos editables */}
        <div className="space-y-2">
          <EditableField
            label="Email"
            icon={<Mail className="h-3 w-3" />}
            value={lead.email}
            editing={editing === 'email'}
            draftValue={String(draft.email ?? lead.email ?? '')}
            onChange={(v) => setDraft({ ...draft, email: v || null })}
            onEdit={() => startEdit('email')}
            onSave={saveEdit}
            onCancel={cancelEdit}
            saving={saving}
            type="email"
            placeholder="paciente@email.com"
          />

          <EditableField
            label="Ciudad"
            icon={<MapPin className="h-3 w-3" />}
            value={lead.city}
            editing={editing === 'city'}
            draftValue={String(draft.city ?? lead.city ?? '')}
            onChange={(v) => setDraft({ ...draft, city: v || null })}
            onEdit={() => startEdit('city')}
            onSave={saveEdit}
            onCancel={cancelEdit}
            saving={saving}
            placeholder="Ciudad de residencia"
          />

          <EditableField
            label="Tratamiento de interés"
            icon={<Stethoscope className="h-3 w-3" />}
            value={lead.treatment_interest}
            editing={editing === 'treatment_interest'}
            draftValue={String(draft.treatment_interest ?? lead.treatment_interest ?? '')}
            onChange={(v) => setDraft({ ...draft, treatment_interest: v || null })}
            onEdit={() => startEdit('treatment_interest')}
            onSave={saveEdit}
            onCancel={cancelEdit}
            saving={saving}
            placeholder="Blanqueamiento, ortodoncia…"
          />

          {/* Urgencia (select) */}
          <div className="rounded-xl border border-white/[0.04] bg-dark-900/40 p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3 text-zinc-500" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Urgencia</span>
            </div>
            <div className="flex gap-1">
              {URGENCIES.map((u) => {
                const active = lead.urgency_level === u
                const tone =
                  u === 'emergency' || u === 'high'
                    ? 'bg-red-500/15 text-red-400 ring-red-500/30'
                    : u === 'medium'
                    ? 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
                    : 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30'
                return (
                  <button
                    key={u}
                    onClick={() => onUpdate({ urgency_level: u })}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                      active ? `${tone} ring-1` : 'bg-dark-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {URGENCY_LABELS[u]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notas (textarea) */}
          <EditableField
            label="Notas internas"
            icon={<FileText className="h-3 w-3" />}
            value={lead.notes}
            editing={editing === 'notes'}
            draftValue={String(draft.notes ?? lead.notes ?? '')}
            onChange={(v) => setDraft({ ...draft, notes: v || null })}
            onEdit={() => startEdit('notes')}
            onSave={saveEdit}
            onCancel={cancelEdit}
            saving={saving}
            multiline
            placeholder="Observaciones, preferencias, alergias…"
          />
        </div>

        {/* Timeline */}
        <div className="rounded-xl border border-white/[0.04] bg-dark-900/40 p-3">
          <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <Clock className="h-3 w-3" /> Cronología
          </p>
          <ul className="space-y-1.5 text-[12px] text-zinc-400">
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-lime-400" />
              Primer contacto: <span className="text-zinc-200">{formatRelative(lead.first_contact_at ?? lead.created_at)}</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-sky-400" />
              Último mensaje: <span className="text-zinc-200">{formatRelative(lead.last_message_at)}</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-zinc-500" />
              Fuente: <span className="text-zinc-200">{lead.source}</span>
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  )
}

function QuickAction({
  icon, label, onClick, primary,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
        primary
          ? 'bg-lime-500 text-dark-900 hover:bg-lime-400'
          : 'border border-dark-500 bg-dark-700 text-zinc-200 hover:border-dark-400 hover:bg-dark-600'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function InlineEditField({
  value, placeholder, onChange, onSave, onCancel, saving, multiline,
}: {
  value: string
  placeholder?: string
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  multiline?: boolean
}) {
  return (
    <div className="flex w-full items-center gap-1.5">
      {multiline ? (
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-none rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/40"
        />
      ) : (
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave()
            if (e.key === 'Escape') onCancel()
          }}
          className="flex-1 rounded-lg border border-dark-500 bg-dark-700 px-2.5 py-1.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/40"
        />
      )}
      <button onClick={onSave} disabled={saving} className="rounded-lg p-1.5 text-lime-400 hover:bg-lime-500/15 disabled:opacity-50">
        <Save className="h-3.5 w-3.5" />
      </button>
      <button onClick={onCancel} className="rounded-lg p-1.5 text-zinc-500 hover:bg-dark-600 hover:text-white">
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function EditableField({
  label, icon, value, editing, draftValue, onChange, onEdit, onSave, onCancel, saving, multiline, placeholder, type,
}: {
  label: string
  icon: React.ReactNode
  value: string | null
  editing: boolean
  draftValue: string
  onChange: (v: string) => void
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  multiline?: boolean
  placeholder?: string
  type?: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-dark-900/40 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {icon}
          {label}
        </span>
        {!editing && (
          <button onClick={onEdit} className="inline-flex items-center gap-1 text-[10.5px] text-lime-400 hover:text-lime-300">
            <Edit3 className="h-2.5 w-2.5" /> Editar
          </button>
        )}
      </div>
      {editing ? (
        multiline ? (
          <InlineEditField
            value={draftValue} onChange={onChange}
            onSave={onSave} onCancel={onCancel} saving={saving}
            multiline placeholder={placeholder}
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              type={type ?? 'text'}
              value={draftValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave()
                if (e.key === 'Escape') onCancel()
              }}
              className="flex-1 rounded-lg border border-dark-500 bg-dark-700 px-2.5 py-1.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/40"
            />
            <button onClick={onSave} disabled={saving} className="rounded-lg p-1.5 text-lime-400 hover:bg-lime-500/15 disabled:opacity-50">
              <Save className="h-3.5 w-3.5" />
            </button>
            <button onClick={onCancel} className="rounded-lg p-1.5 text-zinc-500 hover:bg-dark-600 hover:text-white">
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      ) : (
        <p className={`text-[13px] ${value ? 'text-zinc-200' : 'italic text-zinc-600'}`}>
          {value ?? 'Sin información'}
        </p>
      )}
    </div>
  )
}

// ============================================================
//  CreateModal
// ============================================================
function CreateModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    city: '',
    treatment_interest: '',
    urgency_level: 'low' as typeof URGENCIES[number],
    notes: '',
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    const body: Record<string, string> = { phone: form.phone.trim() }
    if (form.name.trim()) body.name = form.name.trim()
    if (form.email.trim()) body.email = form.email.trim()
    if (form.city.trim()) body.city = form.city.trim()
    if (form.treatment_interest.trim()) body.treatment_interest = form.treatment_interest.trim()
    if (form.notes.trim()) body.notes = form.notes.trim()
    body.urgency_level = form.urgency_level

    const res = await api.post('/api/leads', body)
    setCreating(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onCreated()
  }

  return (
    <Modal open={true} onClose={onClose} title="Nuevo lead">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre del paciente"
          />
          <Input
            label="Teléfono *"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+52 55 1234 5678"
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="paciente@email.com"
          />
          <Input
            label="Ciudad"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder="Ciudad"
          />
        </div>
        <Input
          label="Interés de tratamiento"
          value={form.treatment_interest}
          onChange={(e) => setForm({ ...form, treatment_interest: e.target.value })}
          placeholder="Blanqueamiento, ortodoncia, implantes…"
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Urgencia</label>
          <div className="grid grid-cols-4 gap-1">
            {URGENCIES.map((u) => {
              const active = form.urgency_level === u
              const tone =
                u === 'emergency' || u === 'high'
                  ? 'bg-red-500/15 text-red-400 ring-red-500/30'
                  : u === 'medium'
                  ? 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
                  : 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30'
              return (
                <button
                  type="button"
                  key={u}
                  onClick={() => setForm({ ...form, urgency_level: u })}
                  className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                    active ? `${tone} ring-1` : 'bg-dark-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  {URGENCY_LABELS[u]}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Notas</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Observaciones, fuente, contexto…"
            className="w-full resize-none rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/40"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2 text-[12.5px] text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={creating}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Crear lead
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Aviso de campos no exportados pero usados como tipo ────
export type { Lead }
