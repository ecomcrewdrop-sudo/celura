// ============================================================
//  CELURA · Pagina Citas - 3 vistas + lead picker + inline edit
//  Vistas: Lista agrupada por dia / Semana / Agenda hoy
//  Stats hero, filtros con contadores, busqueda, status quick
//  actions, modal crear con buscador de lead y sugerencias.
// ============================================================

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { api } from '@/lib/api'
import { useClinic } from '@/hooks/useClinic'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import {
  Plus,
  Calendar,
  Clock,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  CalendarDays,
  LayoutList,
  CalendarRange,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  Stethoscope,
  FileText,
  CalendarClock,
  Sparkles,
  TrendingUp,
  CheckCheck,
  X as XIcon,
  Edit3,
} from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────
interface Appointment {
  id: string
  lead_id: string
  scheduled_at: string
  duration_min: number
  treatment: string | null
  status: string
  notes: string | null
  created_at: string
}

interface Lead {
  id: string
  name: string | null
  phone: string
  treatment_interest: string | null
  urgency_level: string
  stage: string
}

type ViewMode = 'list' | 'week' | 'today'

// ── Constantes ───────────────────────────────────────────────
// Las clases de Tailwind se deben listar como strings completos para que JIT las detecte
const STATUS_META: Record<
  string,
  {
    label: string
    color: string
    icon: typeof CheckCircle2
    bar: string       // borde lateral de la fila
    weekBorder: string  // borde card en vista semana
    weekBg: string      // fondo card en vista semana
    activeBtn: string   // boton seleccionado en modal detalle
  }
> = {
  scheduled: {
    label: 'Agendada', color: 'blue', icon: CalendarClock,
    bar: 'bg-blue-500/40',
    weekBorder: 'border-blue-500/60', weekBg: 'bg-blue-500/5',
    activeBtn: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
  },
  confirmed: {
    label: 'Confirmada', color: 'emerald', icon: CheckCircle2,
    bar: 'bg-emerald-500/40',
    weekBorder: 'border-emerald-500/60', weekBg: 'bg-emerald-500/5',
    activeBtn: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
  },
  attended: {
    label: 'Atendida', color: 'lime', icon: CheckCheck,
    bar: 'bg-lime-500/40',
    weekBorder: 'border-lime-500/60', weekBg: 'bg-lime-500/5',
    activeBtn: 'bg-lime-500/15 text-lime-400 ring-1 ring-lime-500/30',
  },
  no_show: {
    label: 'No asistió', color: 'red', icon: XCircle,
    bar: 'bg-red-500/40',
    weekBorder: 'border-red-500/60', weekBg: 'bg-red-500/5',
    activeBtn: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  },
  cancelled: {
    label: 'Cancelada', color: 'zinc', icon: XIcon,
    bar: 'bg-zinc-500/40',
    weekBorder: 'border-zinc-500/60', weekBg: 'bg-zinc-500/5',
    activeBtn: 'bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30',
  },
  rescheduled: {
    label: 'Reagendada', color: 'amber', icon: CalendarClock,
    bar: 'bg-amber-500/40',
    weekBorder: 'border-amber-500/60', weekBg: 'bg-amber-500/5',
    activeBtn: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
  },
}

const STATUS_FLOW = ['scheduled', 'confirmed', 'attended', 'no_show', 'cancelled', 'rescheduled']

const TREATMENT_DURATIONS: Record<string, number> = {
  consulta: 30,
  limpieza: 45,
  blanqueamiento: 60,
  ortodoncia: 60,
  endodoncia: 90,
  implante: 120,
  extraccion: 45,
  carillas: 90,
  prótesis: 60,
}

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS_LONG = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ── Helpers de fecha ─────────────────────────────────────────
const startOfDay = (d: Date) => {
  const n = new Date(d); n.setHours(0, 0, 0, 0); return n
}
const endOfDay = (d: Date) => {
  const n = new Date(d); n.setHours(23, 59, 59, 999); return n
}
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const startOfWeek = (d: Date) => {
  const n = startOfDay(d)
  const day = n.getDay()
  const diff = day === 0 ? -6 : 1 - day // lunes como inicio de semana
  n.setDate(n.getDate() + diff)
  return n
}

const addDays = (d: Date, n: number) => {
  const x = new Date(d); x.setDate(x.getDate() + n); return x
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })

const formatRelative = (iso: string): string => {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const past = diffMs < 0
  const abs = Math.abs(diffMs)
  const mins = Math.floor(abs / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (mins < 1) return past ? 'ahora mismo' : 'en un instante'
  if (mins < 60) return past ? `hace ${mins} min` : `en ${mins} min`
  if (hours < 24) return past ? `hace ${hours} h` : `en ${hours} h`
  if (days < 7) return past ? `hace ${days} d` : `en ${days} d`
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

const groupLabel = (date: Date): string => {
  const now = startOfDay(new Date())
  const d = startOfDay(date)
  const diff = Math.round((d.getTime() - now.getTime()) / 86_400_000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff === -1) return 'Ayer'
  if (diff > 0 && diff < 7) return DAYS_LONG[d.getDay()] ?? ''
  return `${DAYS_LONG[d.getDay()]} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`
}

// Para datetime-local: yyyy-mm-ddThh:mm
const toLocalInput = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const initials = (name: string | null | undefined, phone: string): string => {
  if (name) {
    const parts = name.trim().split(/\s+/)
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  }
  return phone.slice(-2)
}

// ── Componente principal ─────────────────────────────────────
export default function Appointments() {
  const { config } = useClinic()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [leadsMap, setLeadsMap] = useState<Map<string, Lead>>(new Map())
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('list')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()))

  // ── Fetch citas + leads ─────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [aRes, lRes] = await Promise.all([
      api.get<{ appointments: Appointment[]; total: number }>(
        `/api/appointments?limit=200&order=upcoming`,
      ),
      api.get<{ leads: Lead[] }>('/api/leads?limit=200&order=recent'),
    ])
    if (aRes.data) setAppointments(aRes.data.appointments)
    if (lRes.data) {
      const map = new Map<string, Lead>()
      lRes.data.leads.forEach((l) => map.set(l.id, l))
      setLeadsMap(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Filtrado client-side ────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return appointments.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false
      if (q) {
        const lead = leadsMap.get(a.lead_id)
        const hay = [
          lead?.name ?? '',
          lead?.phone ?? '',
          a.treatment ?? '',
          a.notes ?? '',
        ].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [appointments, statusFilter, search, leadsMap])

  // ── Stats hero ──────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date()
    const todayEnd = endOfDay(now)
    const weekEnd = addDays(startOfDay(now), 7)
    let today = 0, week = 0, attended = 0, totalDone = 0, noShow = 0
    appointments.forEach((a) => {
      const d = new Date(a.scheduled_at)
      if (d >= now && d <= todayEnd && (a.status === 'scheduled' || a.status === 'confirmed')) today++
      if (d >= now && d <= weekEnd && (a.status === 'scheduled' || a.status === 'confirmed')) week++
      if (a.status === 'attended') { attended++; totalDone++ }
      if (a.status === 'no_show') { noShow++; totalDone++ }
    })
    const showRate = totalDone > 0 ? Math.round((attended / totalDone) * 100) : null
    return { today, week, showRate, noShow }
  }, [appointments])

  // Contadores por status para los chips
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { '': appointments.length }
    appointments.forEach((a) => { counts[a.status] = (counts[a.status] ?? 0) + 1 })
    return counts
  }, [appointments])

  // ── Próxima cita destacada ─────────────────────────────
  const nextAppt = useMemo(() => {
    const now = new Date()
    return appointments
      .filter((a) => (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.scheduled_at) >= now)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0]
  }, [appointments])

  // ── Acciones ───────────────────────────────────────────
  const updateStatus = async (id: string, status: string) => {
    await api.patch(`/api/appointments/${id}`, { status })
    await fetchData()
    if (selected?.id === id) {
      setSelected((prev) => prev ? { ...prev, status } : null)
    }
  }

  const cancelAppt = async (id: string) => {
    await api.delete(`/api/appointments/${id}`)
    setSelected(null)
    await fetchData()
  }

  const handleCreated = async () => {
    setShowCreate(false)
    await fetchData()
  }

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Citas"
        subtitle={`${appointments.length} citas en total · ${stats.week} próximas esta semana`}
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Nueva cita
          </Button>
        }
      />

      {/* ═══ Stats hero ═══ */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Hoy"
          value={stats.today}
          icon={<Calendar className="h-4 w-4" />}
          color="lime"
          hint={stats.today === 0 ? 'Sin citas hoy' : stats.today === 1 ? '1 paciente' : `${stats.today} pacientes`}
        />
        <StatCard
          label="Esta semana"
          value={stats.week}
          icon={<CalendarDays className="h-4 w-4" />}
          color="sky"
        />
        <StatCard
          label="Tasa de asistencia"
          value={stats.showRate !== null ? `${stats.showRate}%` : '—'}
          icon={<TrendingUp className="h-4 w-4" />}
          color={stats.showRate === null ? 'zinc' : stats.showRate >= 80 ? 'lime' : stats.showRate >= 60 ? 'amber' : 'red'}
          hint={stats.showRate === null ? 'Sin historial aún' : 'Atendidas vs no-show'}
        />
        <StatCard
          label="No-shows"
          value={stats.noShow}
          icon={<AlertCircle className="h-4 w-4" />}
          color={stats.noShow > 3 ? 'red' : 'zinc'}
          hint="Histórico"
        />
      </div>

      {/* ═══ Próxima cita destacada ═══ */}
      {nextAppt && (
        <NextAppointmentCard
          appt={nextAppt}
          lead={leadsMap.get(nextAppt.lead_id)}
          onOpen={() => setSelected(nextAppt)}
          onConfirm={() => updateStatus(nextAppt.id, 'confirmed')}
        />
      )}

      {/* ═══ Toolbar: tabs vista + busqueda + filtros ═══ */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Tabs de vista */}
        <div className="inline-flex rounded-xl border border-dark-600 bg-dark-800 p-1">
          <ViewTab active={view === 'list'} onClick={() => setView('list')} icon={<LayoutList className="h-3.5 w-3.5" />}>
            Lista
          </ViewTab>
          <ViewTab active={view === 'week'} onClick={() => setView('week')} icon={<CalendarRange className="h-3.5 w-3.5" />}>
            Semana
          </ViewTab>
          <ViewTab active={view === 'today'} onClick={() => setView('today')} icon={<CalendarClock className="h-3.5 w-3.5" />}>
            Hoy
          </ViewTab>
        </div>

        {/* Search */}
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar paciente, tratamiento, notas…"
            className="w-full rounded-lg border border-dark-600 bg-dark-800 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-lime-500/40"
          />
        </div>
      </div>

      {/* ═══ Filtros chip ═══ */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <FilterChip active={statusFilter === ''} onClick={() => setStatusFilter('')} count={statusCounts['']}>
          Todas
        </FilterChip>
        {STATUS_FLOW.map((s) => (
          <FilterChip
            key={s}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
            count={statusCounts[s] ?? 0}
            color={STATUS_META[s]?.color}
          >
            {STATUS_META[s]?.label}
          </FilterChip>
        ))}
      </div>

      {/* ═══ Contenido segun vista ═══ */}
      {loading ? (
        <LoadingState />
      ) : view === 'list' ? (
        <ListView
          appointments={filtered}
          leadsMap={leadsMap}
          onSelect={setSelected}
          onQuickStatus={updateStatus}
        />
      ) : view === 'week' ? (
        <WeekView
          appointments={filtered}
          leadsMap={leadsMap}
          weekStart={weekStart}
          onPrev={() => setWeekStart(addDays(weekStart, -7))}
          onNext={() => setWeekStart(addDays(weekStart, 7))}
          onToday={() => setWeekStart(startOfWeek(new Date()))}
          onSelect={setSelected}
        />
      ) : (
        <TodayView
          appointments={filtered}
          leadsMap={leadsMap}
          onSelect={setSelected}
          onQuickStatus={updateStatus}
        />
      )}

      {/* ═══ Modal detalle ═══ */}
      {selected && (
        <DetailModal
          appt={selected}
          lead={leadsMap.get(selected.lead_id)}
          onClose={() => setSelected(null)}
          onStatus={(s) => updateStatus(selected.id, s)}
          onCancel={() => cancelAppt(selected.id)}
          onUpdated={fetchData}
        />
      )}

      {/* ═══ Modal crear ═══ */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
          treatments={config?.treatments ?? []}
        />
      )}
    </div>
  )
}

// ============================================================
//  StatCard - Mini metrica en la hero
// ============================================================
function StatCard({
  label,
  value,
  icon,
  color = 'lime',
  hint,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
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

// ============================================================
//  NextAppointmentCard - Hero card de la siguiente cita
// ============================================================
function NextAppointmentCard({
  appt,
  lead,
  onOpen,
  onConfirm,
}: {
  appt: Appointment
  lead: Lead | undefined
  onOpen: () => void
  onConfirm: () => void
}) {
  const date = new Date(appt.scheduled_at)
  const isToday = isSameDay(date, new Date())
  const isConfirmed = appt.status === 'confirmed'

  return (
    <Card className="mb-6 overflow-hidden p-0">
      <div className="relative bg-[radial-gradient(circle_at_top_right,rgba(132,204,22,0.10),transparent_60%)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lime-500/15 text-sm font-bold text-lime-400 ring-1 ring-lime-500/30">
              {initials(lead?.name, lead?.phone ?? '')}
              {isToday && (
                <span className="absolute -right-1 -top-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-lime-400" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-lime-400/80">
                  Próxima cita
                </span>
                <span className="text-[11px] text-zinc-500">{formatRelative(appt.scheduled_at)}</span>
              </div>
              <div className="mt-0.5 truncate text-base font-semibold text-white">
                {lead?.name ?? lead?.phone ?? 'Paciente'}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {groupLabel(date)} · {formatTime(appt.scheduled_at)}
                </span>
                {appt.treatment && (
                  <span className="inline-flex items-center gap-1">
                    <Stethoscope className="h-3 w-3" /> {appt.treatment}
                  </span>
                )}
                <span className="text-zinc-600">{appt.duration_min} min</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {!isConfirmed && (
              <Button size="sm" variant="secondary" onClick={onConfirm}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar
              </Button>
            )}
            <Button size="sm" onClick={onOpen}>
              Ver detalle
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ============================================================
//  Tabs y chips
// ============================================================
function ViewTab({
  active,
  onClick,
  children,
  icon,
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
  active,
  onClick,
  children,
  count,
  color,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
  color?: string
}) {
  const activeColors: Record<string, string> = {
    blue: 'bg-blue-500/15 text-blue-400 ring-blue-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
    lime: 'bg-lime-500/15 text-lime-400 ring-lime-500/30',
    red: 'bg-red-500/15 text-red-400 ring-red-500/30',
    zinc: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30',
    amber: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  }
  const activeClass = active
    ? color
      ? `${activeColors[color]} ring-1`
      : 'bg-lime-500/15 text-lime-400 ring-1 ring-lime-500/30'
    : 'text-zinc-400 hover:bg-dark-700 hover:text-white'
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${activeClass}`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? 'bg-white/10' : 'bg-dark-700 text-zinc-500'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

// ============================================================
//  ListView - Lista agrupada por dia
// ============================================================
function ListView({
  appointments,
  leadsMap,
  onSelect,
  onQuickStatus,
}: {
  appointments: Appointment[]
  leadsMap: Map<string, Lead>
  onSelect: (a: Appointment) => void
  onQuickStatus: (id: string, status: string) => void
}) {
  // Agrupar por dia
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; date: Date; items: Appointment[] }>()
    appointments.forEach((a) => {
      const d = startOfDay(new Date(a.scheduled_at))
      const key = d.toISOString()
      const existing = map.get(key)
      if (existing) existing.items.push(a)
      else map.set(key, { label: groupLabel(d), date: d, items: [a] })
    })
    return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [appointments])

  if (appointments.length === 0) return <EmptyState />

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.date.toISOString()}>
          <div className="mb-2 flex items-center gap-3">
            <h3 className="text-[12.5px] font-semibold uppercase tracking-wider text-zinc-400">
              {g.label}
            </h3>
            <div className="h-px flex-1 bg-dark-600" />
            <span className="text-[11px] text-zinc-600">{g.items.length} cita{g.items.length !== 1 ? 's' : ''}</span>
          </div>
          <Card className="overflow-hidden p-0">
            <div className="divide-y divide-dark-600">
              {g.items.map((a) => (
                <AppointmentRow
                  key={a.id}
                  appt={a}
                  lead={leadsMap.get(a.lead_id)}
                  onClick={() => onSelect(a)}
                  onQuickStatus={onQuickStatus}
                />
              ))}
            </div>
          </Card>
        </div>
      ))}
    </div>
  )
}

function AppointmentRow({
  appt,
  lead,
  onClick,
  onQuickStatus,
}: {
  appt: Appointment
  lead: Lead | undefined
  onClick: () => void
  onQuickStatus: (id: string, status: string) => void
}) {
  const meta = STATUS_META[appt.status] ?? STATUS_META.scheduled!
  const Icon = meta.icon
  const date = new Date(appt.scheduled_at)
  const isPast = date < new Date()
  const isPending = appt.status === 'scheduled' || appt.status === 'confirmed'

  return (
    <div
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-dark-700/50 sm:gap-4 sm:px-5"
    >
      {/* Hora grande */}
      <div className="w-12 shrink-0 text-right sm:w-14">
        <div className="font-mono text-[15px] font-semibold text-white sm:text-base">{formatTime(appt.scheduled_at)}</div>
        <div className="text-[10.5px] text-zinc-500">{appt.duration_min} min</div>
      </div>

      {/* Linea vertical de status */}
      <div className={`h-12 w-0.5 shrink-0 rounded-full ${meta.bar}`} />

      {/* Avatar + info */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
        <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dark-600 text-xs font-bold text-zinc-300 ring-1 ring-white/[0.04] sm:flex">
          {initials(lead?.name, lead?.phone ?? '')}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-white">
              {lead?.name ?? lead?.phone ?? 'Paciente sin asignar'}
            </p>
            {!isPast && isPending && (
              <span className="text-[10.5px] text-zinc-500">· {formatRelative(appt.scheduled_at)}</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-zinc-500">
            <Stethoscope className="h-3 w-3" />
            <span className="truncate">{appt.treatment ?? 'Consulta general'}</span>
            {lead?.urgency_level === 'high' || lead?.urgency_level === 'emergency' ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                <AlertCircle className="h-2.5 w-2.5" /> {lead.urgency_level}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Status + quick actions */}
      <div className="flex shrink-0 items-center gap-2">
        {isPending && (
          <div className="hidden gap-1 opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
            {appt.status === 'scheduled' && (
              <button
                onClick={(e) => { e.stopPropagation(); onQuickStatus(appt.id, 'confirmed') }}
                className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-emerald-500/15 hover:text-emerald-400"
                title="Confirmar"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onQuickStatus(appt.id, 'attended') }}
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-lime-500/15 hover:text-lime-400"
              title="Marcar atendida"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          </div>
        )}
        <Badge variant={meta.color}>
          <Icon className="mr-1 inline h-3 w-3" />
          {meta.label}
        </Badge>
      </div>
    </div>
  )
}

// ============================================================
//  WeekView - Vista calendario semanal
// ============================================================
function WeekView({
  appointments,
  leadsMap,
  weekStart,
  onPrev,
  onNext,
  onToday,
  onSelect,
}: {
  appointments: Appointment[]
  leadsMap: Map<string, Lead>
  weekStart: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onSelect: (a: Appointment) => void
}) {
  const today = startOfDay(new Date())
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = addDays(weekStart, 6)

  // Agrupar appointments por dia
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    days.forEach((d) => map.set(d.toDateString(), []))
    appointments.forEach((a) => {
      const k = startOfDay(new Date(a.scheduled_at)).toDateString()
      if (map.has(k)) map.get(k)!.push(a)
    })
    map.forEach((arr) => arr.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()))
    return map
  }, [appointments, days])

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-dark-600 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {weekStart.getDate()} {MONTHS_LONG[weekStart.getMonth()]?.slice(0, 3)} — {weekEnd.getDate()} {MONTHS_LONG[weekEnd.getMonth()]?.slice(0, 3)}
          </h3>
          <p className="text-[11px] text-zinc-500">{weekStart.getFullYear()}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onPrev} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-dark-700 hover:text-white">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={onToday} className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-dark-700">
            Hoy
          </button>
          <button onClick={onNext} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-dark-700 hover:text-white">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
      <div className="grid min-w-[840px] grid-cols-7 gap-px bg-dark-600">
        {days.map((d) => {
          const items = byDay.get(d.toDateString()) ?? []
          const isToday = isSameDay(d, today)
          return (
            <div key={d.toISOString()} className={`min-h-[200px] bg-dark-800 p-2 ${isToday ? 'bg-lime-500/[0.02]' : ''}`}>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-zinc-500">{DAYS_SHORT[d.getDay()]}</div>
                  <div className={`text-lg font-semibold ${isToday ? 'text-lime-400' : 'text-white'}`}>
                    {d.getDate()}
                  </div>
                </div>
                {items.length > 0 && (
                  <span className="rounded-full bg-dark-700 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                    {items.length}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {items.slice(0, 4).map((a) => {
                  const lead = leadsMap.get(a.lead_id)
                  const meta = STATUS_META[a.status] ?? STATUS_META.scheduled!
                  return (
                    <button
                      key={a.id}
                      onClick={() => onSelect(a)}
                      className={`w-full rounded-md border-l-2 px-1.5 py-1 text-left transition-colors hover:bg-dark-700 ${meta.weekBorder} ${meta.weekBg}`}
                    >
                      <div className="font-mono text-[10.5px] text-zinc-400">{formatTime(a.scheduled_at)}</div>
                      <div className="truncate text-[11px] font-medium text-white">
                        {lead?.name ?? lead?.phone ?? '—'}
                      </div>
                      {a.treatment && (
                        <div className="truncate text-[10px] text-zinc-500">{a.treatment}</div>
                      )}
                    </button>
                  )
                })}
                {items.length > 4 && (
                  <div className="text-center text-[10px] text-zinc-500">+{items.length - 4} más</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </Card>
  )
}

// ============================================================
//  TodayView - Agenda hora por hora
// ============================================================
function TodayView({
  appointments,
  leadsMap,
  onSelect,
  onQuickStatus,
}: {
  appointments: Appointment[]
  leadsMap: Map<string, Lead>
  onSelect: (a: Appointment) => void
  onQuickStatus: (id: string, status: string) => void
}) {
  const today = startOfDay(new Date())
  const todayAppts = appointments
    .filter((a) => isSameDay(new Date(a.scheduled_at), today))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  if (todayAppts.length === 0) {
    return (
      <Card>
        <div className="py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-dark-700">
            <Calendar className="h-6 w-6 text-zinc-500" />
          </div>
          <p className="text-sm text-zinc-400">No hay citas para hoy</p>
          <p className="mt-1 text-[12px] text-zinc-600">
            Disfrutá el día tranquilo o agendá una nueva cita.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-0">
      <div className="border-b border-dark-600 px-5 py-3">
        <h3 className="text-sm font-semibold text-white">
          {DAYS_LONG[today.getDay()]} {today.getDate()} de {MONTHS_LONG[today.getMonth()]}
        </h3>
        <p className="text-[11px] text-zinc-500">{todayAppts.length} cita{todayAppts.length !== 1 ? 's' : ''} programada{todayAppts.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="divide-y divide-dark-600">
        {todayAppts.map((a) => (
          <AppointmentRow
            key={a.id}
            appt={a}
            lead={leadsMap.get(a.lead_id)}
            onClick={() => onSelect(a)}
            onQuickStatus={onQuickStatus}
          />
        ))}
      </div>
    </Card>
  )
}

// ============================================================
//  EmptyState y LoadingState
// ============================================================
function EmptyState() {
  return (
    <Card>
      <div className="py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-700">
          <Calendar className="h-7 w-7 text-zinc-500" />
        </div>
        <p className="text-sm font-medium text-zinc-300">No hay citas</p>
        <p className="mt-1 text-[12.5px] text-zinc-500">
          Las citas aparecerán acá cuando agendes una desde el panel o el asistente cierre una conversación.
        </p>
      </div>
    </Card>
  )
}

function LoadingState() {
  return (
    <Card>
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" />
      </div>
    </Card>
  )
}

// ============================================================
//  DetailModal - Detalle con edicion inline
// ============================================================
function DetailModal({
  appt,
  lead,
  onClose,
  onStatus,
  onCancel,
  onUpdated,
}: {
  appt: Appointment
  lead: Lead | undefined
  onClose: () => void
  onStatus: (s: string) => void
  onCancel: () => void
  onUpdated: () => void
}) {
  const [editingDate, setEditingDate] = useState(false)
  const [newDate, setNewDate] = useState(toLocalInput(new Date(appt.scheduled_at)))
  const [notes, setNotes] = useState(appt.notes ?? '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const meta = STATUS_META[appt.status] ?? STATUS_META.scheduled!
  const date = new Date(appt.scheduled_at)

  const saveDate = async () => {
    setSaving(true)
    await api.patch(`/api/appointments/${appt.id}`, {
      scheduled_at: new Date(newDate).toISOString(),
    })
    setSaving(false)
    setEditingDate(false)
    await onUpdated()
  }

  const saveNotes = async () => {
    setSaving(true)
    await api.patch(`/api/appointments/${appt.id}`, { notes: notes || null })
    setSaving(false)
    setEditingNotes(false)
    await onUpdated()
  }

  return (
    <Modal open={true} onClose={onClose} title="Detalle de cita">
      <div className="space-y-4">
        {/* Header con lead */}
        {lead && (
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-dark-900/40 p-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime-500/15 text-sm font-bold text-lime-400 ring-1 ring-lime-500/30">
              {initials(lead.name, lead.phone)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{lead.name ?? 'Sin nombre'}</div>
              <div className="flex items-center gap-1 text-[12px] text-zinc-500">
                <Phone className="h-3 w-3" />
                <span className="font-mono">{lead.phone}</span>
              </div>
            </div>
            <Badge stage={lead.stage}>{lead.stage}</Badge>
          </div>
        )}

        {/* Status actual + flujo */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11.5px] font-medium uppercase tracking-wider text-zinc-500">Estado</p>
            <Badge variant={meta.color}>
              <meta.icon className="mr-1 inline h-3 w-3" />
              {meta.label}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {(['scheduled', 'confirmed', 'attended', 'no_show', 'rescheduled'] as const).map((s) => {
              const m = STATUS_META[s]!
              const isCurrent = appt.status === s
              return (
                <button
                  key={s}
                  onClick={() => !isCurrent && onStatus(s)}
                  disabled={isCurrent}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                    isCurrent ? `${m.activeBtn} cursor-default` : 'bg-dark-700 text-zinc-400 hover:bg-dark-600 hover:text-white'
                  }`}
                >
                  <m.icon className="h-3.5 w-3.5" />
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Fecha (editable) */}
        <div className="rounded-xl border border-white/[0.04] bg-dark-900/40 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wider text-zinc-500">
              <Calendar className="h-3 w-3" /> Fecha y hora
            </p>
            {!editingDate ? (
              <button onClick={() => setEditingDate(true)} className="text-[11px] text-lime-400 hover:text-lime-300">
                Editar
              </button>
            ) : (
              <div className="flex gap-1">
                <button onClick={saveDate} disabled={saving} className="text-[11px] text-lime-400 hover:text-lime-300 disabled:opacity-50">
                  Guardar
                </button>
                <span className="text-zinc-600">·</span>
                <button onClick={() => { setEditingDate(false); setNewDate(toLocalInput(date)) }} className="text-[11px] text-zinc-500 hover:text-white">
                  Cancelar
                </button>
              </div>
            )}
          </div>
          {editingDate ? (
            <input
              type="datetime-local"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-sm text-white outline-none focus:border-lime-500/40"
            />
          ) : (
            <div className="text-sm text-white">
              {DAYS_LONG[date.getDay()]} {date.getDate()} de {MONTHS_LONG[date.getMonth()]} ·{' '}
              <span className="font-mono">{formatTime(appt.scheduled_at)}</span>
              <span className="ml-2 text-[12px] text-zinc-500">({formatRelative(appt.scheduled_at)})</span>
            </div>
          )}
        </div>

        {/* Tratamiento + duracion */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/[0.04] bg-dark-900/40 p-3">
            <p className="inline-flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wider text-zinc-500">
              <Stethoscope className="h-3 w-3" /> Tratamiento
            </p>
            <p className="mt-1 text-sm text-white">{appt.treatment ?? 'Consulta general'}</p>
          </div>
          <div className="rounded-xl border border-white/[0.04] bg-dark-900/40 p-3">
            <p className="inline-flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wider text-zinc-500">
              <Clock className="h-3 w-3" /> Duración
            </p>
            <p className="mt-1 text-sm text-white">{appt.duration_min} min</p>
          </div>
        </div>

        {/* Notas (editable) */}
        <div className="rounded-xl border border-white/[0.04] bg-dark-900/40 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wider text-zinc-500">
              <FileText className="h-3 w-3" /> Notas
            </p>
            {!editingNotes ? (
              <button onClick={() => setEditingNotes(true)} className="inline-flex items-center gap-1 text-[11px] text-lime-400 hover:text-lime-300">
                <Edit3 className="h-3 w-3" /> Editar
              </button>
            ) : (
              <div className="flex gap-1">
                <button onClick={saveNotes} disabled={saving} className="text-[11px] text-lime-400 hover:text-lime-300 disabled:opacity-50">
                  Guardar
                </button>
                <span className="text-zinc-600">·</span>
                <button onClick={() => { setEditingNotes(false); setNotes(appt.notes ?? '') }} className="text-[11px] text-zinc-500 hover:text-white">
                  Cancelar
                </button>
              </div>
            )}
          </div>
          {editingNotes ? (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Agregar notas internas…"
              className="w-full resize-none rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/40"
            />
          ) : (
            <p className="text-[13px] text-zinc-300">
              {appt.notes ?? <span className="text-zinc-600 italic">Sin notas</span>}
            </p>
          )}
        </div>

        {/* Cancelar cita */}
        {!confirmingCancel ? (
          <button
            onClick={() => setConfirmingCancel(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Cancelar cita
          </button>
        ) : (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3">
            <p className="mb-2 text-[12.5px] text-red-300">¿Cancelar definitivamente esta cita?</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmingCancel(false)}>
                Mejor no
              </Button>
              <Button size="sm" variant="danger" onClick={onCancel}>
                Sí, cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ============================================================
//  CreateModal - Crear con buscador de lead
// ============================================================
function CreateModal({
  onClose,
  onCreated,
  treatments,
}: {
  onClose: () => void
  onCreated: () => void
  treatments: string[]
}) {
  const [step, setStep] = useState<'lead' | 'details'>('lead')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [leadQuery, setLeadQuery] = useState('')
  const [leadResults, setLeadResults] = useState<Lead[]>([])
  const [searching, setSearching] = useState(false)
  const [scheduledAt, setScheduledAt] = useState(() => {
    // Sugerir proximo slot redondeado a la siguiente hora completa
    const d = new Date()
    d.setHours(d.getHours() + 1, 0, 0, 0)
    return toLocalInput(d)
  })
  const [duration, setDuration] = useState(60)
  const [treatment, setTreatment] = useState('')
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Busqueda de leads con debounce
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (leadQuery.trim().length < 2) {
      setLeadResults([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      const res = await api.get<{ leads: Lead[] }>(
        `/api/leads?limit=20&search=${encodeURIComponent(leadQuery.trim())}`,
      )
      if (res.data) setLeadResults(res.data.leads)
      setSearching(false)
    }, 250)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [leadQuery])

  // Auto-ajustar duración cuando se elige tratamiento
  useEffect(() => {
    const key = treatment.toLowerCase().trim()
    for (const [k, v] of Object.entries(TREATMENT_DURATIONS)) {
      if (key.includes(k)) {
        setDuration(v)
        return
      }
    }
  }, [treatment])

  // Cargar leads recientes al abrir
  useEffect(() => {
    api.get<{ leads: Lead[] }>('/api/leads?limit=8&order=recent').then((r) => {
      if (r.data && leadQuery.length < 2) setLeadResults(r.data.leads)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async () => {
    if (!selectedLead) return
    setCreating(true)
    setError(null)
    const res = await api.post('/api/appointments', {
      lead_id: selectedLead.id,
      scheduled_at: new Date(scheduledAt).toISOString(),
      duration_min: duration,
      treatment: treatment || undefined,
      notes: notes || undefined,
    })
    setCreating(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onCreated()
  }

  return (
    <Modal open={true} onClose={onClose} title="Nueva cita">
      {/* Stepper */}
      <div className="mb-5 flex items-center gap-2">
        <StepDot active={step === 'lead'} done={!!selectedLead && step !== 'lead'} label="Paciente" />
        <div className={`h-px flex-1 transition-colors ${selectedLead ? 'bg-lime-500/40' : 'bg-dark-600'}`} />
        <StepDot active={step === 'details'} done={false} label="Detalle" />
      </div>

      {step === 'lead' ? (
        <div className="space-y-3">
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              autoFocus
              value={leadQuery}
              onChange={(e) => setLeadQuery(e.target.value)}
              placeholder="Buscar paciente por nombre o teléfono…"
              className="w-full rounded-lg border border-dark-500 bg-dark-700 py-2.5 pl-9 pr-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/40"
            />
          </div>

          {/* Lead seleccionado */}
          {selectedLead && (
            <div className="flex items-center gap-3 rounded-xl border border-lime-500/30 bg-lime-500/[0.05] p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-500/20 text-xs font-bold text-lime-400">
                {initials(selectedLead.name, selectedLead.phone)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{selectedLead.name ?? 'Sin nombre'}</div>
                <div className="font-mono text-[11.5px] text-zinc-400">{selectedLead.phone}</div>
              </div>
              <button onClick={() => setSelectedLead(null)} className="text-zinc-500 hover:text-white">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Resultados */}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {leadQuery.length < 2 && !selectedLead && (
              <p className="px-1 text-[11px] uppercase tracking-wider text-zinc-500">Pacientes recientes</p>
            )}
            {searching ? (
              <div className="flex justify-center py-6">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" />
              </div>
            ) : leadResults.length === 0 && leadQuery.length >= 2 ? (
              <div className="py-6 text-center text-[12.5px] text-zinc-500">
                <User className="mx-auto mb-2 h-5 w-5 text-zinc-600" />
                No se encontraron pacientes
              </div>
            ) : (
              leadResults
                .filter((l) => l.id !== selectedLead?.id)
                .map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLead(l)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-dark-700"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark-600 text-[11px] font-bold text-zinc-300">
                      {initials(l.name, l.phone)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-white">{l.name ?? 'Sin nombre'}</div>
                      <div className="font-mono text-[11px] text-zinc-500">{l.phone}</div>
                    </div>
                    {l.urgency_level === 'high' || l.urgency_level === 'emergency' ? (
                      <Badge urgency={l.urgency_level}>{l.urgency_level}</Badge>
                    ) : null}
                  </button>
                ))
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={() => setStep('details')} disabled={!selectedLead}>
              Siguiente <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Fecha + duracion */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Fecha y hora</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2.5 text-sm text-white outline-none focus:border-lime-500/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Duración (min)</label>
              <div className="flex gap-1">
                {[30, 45, 60, 90, 120].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                      duration === d
                        ? 'bg-lime-500/15 text-lime-400 ring-1 ring-lime-500/30'
                        : 'bg-dark-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tratamiento */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-400">Tratamiento</label>
            <input
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
              placeholder="Limpieza, blanqueamiento, consulta…"
              className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/40"
            />
            {treatments.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {treatments.slice(0, 8).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTreatment(t)}
                    className="inline-flex items-center gap-1 rounded-full bg-dark-700 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-dark-600 hover:text-white"
                  >
                    <Sparkles className="h-2.5 w-2.5 text-lime-400" />
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-400">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Indicaciones para la consulta…"
              className="w-full resize-none rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/40"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2 text-[12.5px] text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-between gap-2 pt-1">
            <Button variant="ghost" onClick={() => setStep('lead')}>
              <ChevronLeft className="h-3.5 w-3.5" /> Atrás
            </Button>
            <Button onClick={handleSubmit} loading={creating}>
              <Calendar className="h-3.5 w-3.5" /> Agendar cita
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ring-1 transition-colors ${
          done
            ? 'bg-lime-500/20 text-lime-400 ring-lime-500/30'
            : active
            ? 'bg-lime-500 text-dark-900 ring-lime-500/50'
            : 'bg-dark-700 text-zinc-500 ring-white/[0.04]'
        }`}
      >
        {done ? <CheckCircle2 className="h-3 w-3" /> : active ? '•' : ''}
      </div>
      <span className={`text-[12px] font-medium ${active || done ? 'text-white' : 'text-zinc-500'}`}>
        {label}
      </span>
    </div>
  )
}
