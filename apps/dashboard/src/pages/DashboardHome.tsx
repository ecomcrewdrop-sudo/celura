// ============================================================
//  CELURA · Dashboard Home (panel principal)
//  - Hero con saludo, fecha, status WA en vivo
//  - 4 KPIs accionables con delta semana vs anterior
//  - "Tu día": citas de hoy timeline + leads calientes pendientes
//  - Mini funnel del pipeline
//  - Setup checklist con progreso
//  - Quick actions (nuevo lead, nueva cita, ver WA)
// ============================================================

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useClinic } from '@/hooks/useClinic'
import Card from '@/components/Card'
import {
  Users,
  CalendarDays,
  MessageSquare,
  ArrowRight,
  Clock,
  Smartphone,
  Zap,
  Flame,
  CheckCircle2,
  AlertCircle,
  Plus,
  Stethoscope,
  TrendingUp,
  TrendingDown,
  Activity,
  Sparkles,
  Settings as Cog,
  Bot,
  Wifi,
  WifiOff,
  Calendar,
  Phone,
  ChevronRight,
  CircleDashed,
} from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────
interface Lead {
  id: string
  name: string | null
  phone: string
  stage: string
  score: number
  urgency_level: string
  treatment_interest: string | null
  last_message_at: string | null
  created_at: string
}
interface Appointment {
  id: string
  lead_id: string
  scheduled_at: string
  treatment: string | null
  status: string
  duration_min: number
}
interface WAStatus {
  status: string
  connected: boolean
  phone: string | null
}

// ── Stage meta (mismo color que Leads.tsx) ───────────────────
const STAGE_META: Record<string, { label: string; dot: string; text: string }> = {
  new:        { label: 'Nuevo',      dot: 'bg-sky-400',     text: 'text-sky-400' },
  contacted:  { label: 'Contactado', dot: 'bg-blue-400',    text: 'text-blue-400' },
  warm:       { label: 'Tibio',      dot: 'bg-amber-400',   text: 'text-amber-400' },
  interested: { label: 'Interesado', dot: 'bg-purple-400',  text: 'text-purple-400' },
  scheduled:  { label: 'Agendado',   dot: 'bg-emerald-400', text: 'text-emerald-400' },
  attended:   { label: 'Atendido',   dot: 'bg-lime-400',    text: 'text-lime-400' },
  recurring:  { label: 'Recurrente', dot: 'bg-teal-400',    text: 'text-teal-400' },
  lost:       { label: 'Perdido',    dot: 'bg-red-400',     text: 'text-red-400' },
}
const STAGE_ORDER = ['new', 'contacted', 'warm', 'interested', 'scheduled', 'attended', 'recurring', 'lost']

// ── Helpers ──────────────────────────────────────────────────
const initials = (name: string | null, phone: string): string => {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/)
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
  }
  return phone.slice(-2)
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })

const formatRelative = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  const day = Math.floor(h / 24)
  return `${day} d`
}

const greetingByHour = (): string => {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// ============================================================
//  Componente principal
// ============================================================
export default function DashboardHome() {
  const { clinic, config } = useClinic()
  const navigate = useNavigate()
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [allAppts, setAllAppts] = useState<Appointment[]>([])
  const [waStatus, setWaStatus] = useState<WAStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [leadsRes, apptsRes, waRes] = await Promise.all([
      api.get<{ leads: Lead[] }>('/api/leads?limit=200&order=recent'),
      api.get<{ appointments: Appointment[] }>('/api/appointments?limit=200&order=upcoming'),
      api.get<WAStatus>('/api/whatsapp/status'),
    ])
    if (leadsRes.data) setAllLeads(leadsRes.data.leads)
    if (apptsRes.data) setAllAppts(apptsRes.data.appointments)
    if (waRes.data) setWaStatus(waRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Refrescar status WA cada 30s sin bloquear UI
  useEffect(() => {
    const t = setInterval(() => {
      api.get<WAStatus>('/api/whatsapp/status').then((r) => {
        if (r.data) setWaStatus(r.data)
      })
    }, 30_000)
    return () => clearInterval(t)
  }, [])

  // ── KPIs con delta vs semana anterior ──────────────────
  const kpis = useMemo(() => {
    const now = Date.now()
    const week = 7 * 86_400_000
    const lastWeekStart = now - week
    const twoWeeksAgo = now - 2 * week

    let totalLeads = allLeads.length
    let hot = 0, newThisWeek = 0, newLastWeek = 0
    let scheduledCount = 0, attended = 0, lost = 0
    let attendedThisWeek = 0, attendedLastWeek = 0

    allLeads.forEach((l) => {
      const created = new Date(l.created_at).getTime()
      if (l.score >= 75) hot++
      if (created >= lastWeekStart) newThisWeek++
      else if (created >= twoWeeksAgo) newLastWeek++
      if (l.stage === 'scheduled') scheduledCount++
      if (l.stage === 'attended' || l.stage === 'recurring') attended++
      if (l.stage === 'lost') lost++
    })

    allAppts.forEach((a) => {
      const at = new Date(a.scheduled_at).getTime()
      if (a.status === 'attended') {
        if (at >= lastWeekStart) attendedThisWeek++
        else if (at >= twoWeeksAgo) attendedLastWeek++
      }
    })

    const newDelta = newLastWeek > 0 ? Math.round(((newThisWeek - newLastWeek) / newLastWeek) * 100) : null
    const attendedDelta = attendedLastWeek > 0
      ? Math.round(((attendedThisWeek - attendedLastWeek) / attendedLastWeek) * 100)
      : null

    const conversionRate = totalLeads > 0 ? Math.round((attended / totalLeads) * 100) : null

    return {
      totalLeads, hot, scheduledCount, attended, lost,
      newThisWeek, newDelta,
      attendedThisWeek, attendedDelta,
      conversionRate,
    }
  }, [allLeads, allAppts])

  // ── Citas de hoy ───────────────────────────────────────
  const todayAppts = useMemo(() => {
    const now = new Date()
    const start = new Date(now); start.setHours(0, 0, 0, 0)
    const end = new Date(now); end.setHours(23, 59, 59, 999)
    return allAppts
      .filter((a) => {
        const d = new Date(a.scheduled_at)
        return d >= start && d <= end && a.status !== 'cancelled'
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  }, [allAppts])

  const nextTodayAppt = useMemo(() => {
    const now = Date.now()
    return todayAppts.find((a) => new Date(a.scheduled_at).getTime() >= now)
  }, [todayAppts])

  // ── Próximas (>= mañana) ───────────────────────────────
  const upcomingAppts = useMemo(() => {
    const tomorrow = new Date(); tomorrow.setHours(0, 0, 0, 0); tomorrow.setDate(tomorrow.getDate() + 1)
    return allAppts
      .filter((a) => {
        const d = new Date(a.scheduled_at)
        return d >= tomorrow && (a.status === 'scheduled' || a.status === 'confirmed')
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      .slice(0, 5)
  }, [allAppts])

  // ── Top leads calientes a contactar ───────────────────
  const hotLeadsToContact = useMemo(() => {
    return allLeads
      .filter((l) => l.score >= 50 && l.stage !== 'scheduled' && l.stage !== 'attended' && l.stage !== 'lost' && l.stage !== 'recurring')
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [allLeads])

  // ── Pipeline counts ────────────────────────────────────
  const pipelineCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    STAGE_ORDER.forEach((s) => (counts[s] = 0))
    allLeads.forEach((l) => { counts[l.stage] = (counts[l.stage] ?? 0) + 1 })
    return counts
  }, [allLeads])

  const maxPipelineCount = Math.max(...Object.values(pipelineCounts), 1)

  // ── Leads map para nombres en citas ───────────────────
  const leadsMap = useMemo(() => {
    const m = new Map<string, Lead>()
    allLeads.forEach((l) => m.set(l.id, l))
    return m
  }, [allLeads])

  // ── Setup checklist ────────────────────────────────────
  const setupSteps = useMemo(() => {
    const wa = waStatus?.connected ?? !!config?.wa_connected
    const aiKey = config?.ai_provider === 'openai' ? !!config?.has_openai_key : !!config?.has_claude_key
    const greetingSet = !!(config?.greeting && config.greeting.trim().length > 10)
    const treatmentsSet = (config?.treatments?.length ?? 0) >= 1
    const scheduleSet = config?.schedule
      ? Object.values(config.schedule).some((v) => v !== null && v !== '')
      : false

    return [
      { id: 'wa', done: wa, label: 'WhatsApp conectado', desc: 'Vincula tu número', path: '/whatsapp', icon: Smartphone },
      { id: 'ai', done: aiKey, label: 'API key de IA', desc: `${config?.ai_provider === 'openai' ? 'OpenAI' : 'Claude'} configurada`, path: '/settings', icon: Zap },
      { id: 'greet', done: greetingSet, label: 'Mensaje de bienvenida', desc: 'Personaliza el saludo', path: '/settings', icon: MessageSquare },
      { id: 'treat', done: treatmentsSet, label: 'Tratamientos', desc: 'Lista lo que ofreces', path: '/settings', icon: Stethoscope },
      { id: 'sched', done: scheduleSet, label: 'Horarios de atención', desc: 'Definí tu agenda', path: '/settings', icon: Clock },
    ]
  }, [config, waStatus])

  const setupProgress = setupSteps.filter((s) => s.done).length
  const setupComplete = setupProgress === setupSteps.length
  const showSetup = !setupComplete

  // ── Render ─────────────────────────────────────────────
  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="animate-fade-in space-y-5">
      {/* ═══════════════ HERO ═══════════════ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-medium capitalize text-zinc-500">{today}</p>
          <h1 className="mt-1 text-[1.75rem] font-bold tracking-tight text-white">
            {greetingByHour()}{clinic?.name ? `, ${clinic.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-[13px] text-zinc-500">
            {nextTodayAppt
              ? <>Tu próxima cita es <span className="text-zinc-300">{formatTime(nextTodayAppt.scheduled_at)}</span> · <span className="text-zinc-400">{leadsMap.get(nextTodayAppt.lead_id)?.name ?? leadsMap.get(nextTodayAppt.lead_id)?.phone ?? 'paciente'}</span></>
              : todayAppts.length > 0
              ? 'Ya pasaron todas tus citas de hoy. ¡Buen trabajo!'
              : 'No tienes citas hoy. Día tranquilo para sumar leads.'}
          </p>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            connected={!!waStatus?.connected}
            connectedLabel="WhatsApp activo"
            disconnectedLabel="WhatsApp offline"
            connectedIcon={<Wifi className="h-3 w-3" />}
            disconnectedIcon={<WifiOff className="h-3 w-3" />}
            onClick={() => navigate('/whatsapp')}
          />
          <StatusBadge
            connected={config?.ai_provider === 'openai' ? !!config?.has_openai_key : !!config?.has_claude_key}
            connectedLabel={`IA: ${config?.ai_provider === 'openai' ? 'OpenAI' : 'Claude'}`}
            disconnectedLabel="Sin API key"
            connectedIcon={<Bot className="h-3 w-3" />}
            disconnectedIcon={<AlertCircle className="h-3 w-3" />}
            onClick={() => navigate('/settings')}
          />
        </div>
      </div>

      {/* ═══════════════ SETUP CHECKLIST ═══════════════ */}
      {showSetup && (
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-300" />
                <h3 className="text-sm font-semibold text-white">Configuración pendiente</h3>
              </div>
              <p className="mt-0.5 text-[12.5px] text-zinc-500">
                {setupProgress} de {setupSteps.length} pasos completos · Termina el setup para empezar a recibir pacientes
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">{Math.round((setupProgress / setupSteps.length) * 100)}%</div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-dark-700">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-lime-400 transition-all duration-500"
              style={{ width: `${(setupProgress / setupSteps.length) * 100}%` }}
            />
          </div>
          {/* Steps */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {setupSteps.map((step) => {
              const Icon = step.icon
              return (
                <button
                  key={step.id}
                  onClick={() => navigate(step.path)}
                  className={`group flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
                    step.done
                      ? 'border-lime-500/20 bg-lime-500/[0.03] hover:bg-lime-500/[0.06]'
                      : 'border-white/[0.04] bg-dark-900/40 hover:border-amber-500/30 hover:bg-dark-900/70'
                  }`}
                >
                  <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    step.done ? 'bg-lime-500/20 text-lime-400' : 'bg-dark-700 text-zinc-500'
                  }`}>
                    {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3 w-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[12.5px] font-medium ${step.done ? 'text-zinc-400 line-through' : 'text-white'}`}>
                      {step.label}
                    </div>
                    <div className="truncate text-[10.5px] text-zinc-500">{step.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {/* ═══════════════ KPIs ═══════════════ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Leads totales"
          value={kpis.totalLeads}
          icon={<Users className="h-4 w-4" />}
          color="sky"
          delta={kpis.newDelta}
          deltaLabel={kpis.newThisWeek ? `+${kpis.newThisWeek} esta semana` : 'sin nuevos'}
          onClick={() => navigate('/leads')}
        />
        <KpiCard
          label="Leads calientes"
          value={kpis.hot}
          icon={<Flame className="h-4 w-4" />}
          color="amber"
          hint="Score ≥ 75"
          onClick={() => navigate('/leads')}
        />
        <KpiCard
          label="Citas hoy"
          value={todayAppts.length}
          icon={<Calendar className="h-4 w-4" />}
          color="lime"
          hint={todayAppts.length === 1 ? '1 paciente' : `${todayAppts.length} pacientes`}
          onClick={() => navigate('/appointments')}
        />
        <KpiCard
          label="Conversión"
          value={kpis.conversionRate !== null ? `${kpis.conversionRate}%` : '—'}
          icon={<TrendingUp className="h-4 w-4" />}
          color={kpis.conversionRate === null ? 'zinc' : kpis.conversionRate >= 30 ? 'lime' : 'amber'}
          hint="Atendidos / total"
          delta={kpis.attendedDelta}
          deltaLabel={kpis.attendedThisWeek ? `${kpis.attendedThisWeek} atendidos esta semana` : 'sin atendidos'}
          onClick={() => navigate('/leads')}
        />
      </div>

      {/* ═══════════════ GRID PRINCIPAL ═══════════════ */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Col izquierda (2/3): Tu día ── */}
        <div className="space-y-5 lg:col-span-2">
          {/* Tu día - timeline de citas hoy */}
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-dark-600 px-5 py-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-lime-400" />
                <h3 className="text-sm font-semibold text-white">Tu día</h3>
                {todayAppts.length > 0 && (
                  <span className="rounded-full bg-dark-700 px-2 py-0.5 text-[10.5px] font-medium text-zinc-400">
                    {todayAppts.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => navigate('/appointments')}
                className="inline-flex items-center gap-1 text-[11.5px] text-zinc-500 hover:text-lime-400"
              >
                Ver todas <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" />
              </div>
            ) : todayAppts.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Calendar className="mx-auto mb-2 h-7 w-7 text-zinc-600" />
                <p className="text-sm text-zinc-400">No tienes citas hoy</p>
                <p className="mt-0.5 text-[12px] text-zinc-600">
                  {upcomingAppts.length > 0
                    ? `Próxima: ${formatTime(upcomingAppts[0]!.scheduled_at)} ${new Date(upcomingAppts[0]!.scheduled_at).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' })}`
                    : 'Tampoco hay citas próximas.'}
                </p>
                <button
                  onClick={() => navigate('/appointments')}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-lime-500 px-3 py-1.5 text-xs font-medium text-dark-900 hover:bg-lime-400"
                >
                  <Plus className="h-3 w-3" /> Agendar cita
                </button>
              </div>
            ) : (
              <div className="divide-y divide-dark-600">
                {todayAppts.map((a, idx) => {
                  const lead = leadsMap.get(a.lead_id)
                  const past = new Date(a.scheduled_at).getTime() < Date.now()
                  const isNext = nextTodayAppt?.id === a.id
                  return (
                    <button
                      key={a.id}
                      onClick={() => navigate('/appointments')}
                      className={`flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-dark-700/40 ${past ? 'opacity-60' : ''}`}
                    >
                      {/* Hora + linea */}
                      <div className="w-14 shrink-0 text-right">
                        <div className="font-mono text-sm font-semibold text-white">{formatTime(a.scheduled_at)}</div>
                        <div className="text-[10px] text-zinc-500">{a.duration_min} min</div>
                      </div>
                      <div className="relative flex shrink-0 flex-col items-center">
                        <div className={`h-2.5 w-2.5 rounded-full ${
                          isNext ? 'bg-lime-400 ring-4 ring-lime-400/20' : past ? 'bg-dark-500' : 'bg-zinc-500'
                        }`} />
                        {idx < todayAppts.length - 1 && (
                          <div className="absolute top-2.5 h-12 w-px bg-dark-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13.5px] font-medium text-white">
                            {lead?.name ?? lead?.phone ?? 'Paciente'}
                          </p>
                          {isNext && !past && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-lime-500/15 px-1.5 py-0.5 text-[10px] font-medium text-lime-400">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-75" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-lime-400" />
                              </span>
                              Próxima
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-zinc-500">
                          {a.treatment ?? 'Consulta general'}
                          {lead?.phone && <span className="ml-2 font-mono text-zinc-600">{lead.phone}</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Leads calientes a contactar */}
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-dark-600 px-5 py-3">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-300" />
                <h3 className="text-sm font-semibold text-white">Leads calientes esperando</h3>
                {hotLeadsToContact.length > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-medium text-amber-400">
                    {hotLeadsToContact.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => navigate('/leads')}
                className="inline-flex items-center gap-1 text-[11.5px] text-zinc-500 hover:text-lime-400"
              >
                Ver todos <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              </div>
            ) : hotLeadsToContact.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Sparkles className="mx-auto mb-2 h-6 w-6 text-zinc-600" />
                <p className="text-[13px] text-zinc-400">Sin leads pendientes de contactar</p>
                <p className="mt-0.5 text-[11.5px] text-zinc-600">
                  Los pacientes con score ≥ 50 que aún no agendaron aparecerán acá.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-dark-600">
                {hotLeadsToContact.map((l) => {
                  const meta = STAGE_META[l.stage] ?? STAGE_META.new!
                  const isUrgent = l.urgency_level === 'high' || l.urgency_level === 'emergency'
                  return (
                    <button
                      key={l.id}
                      onClick={() => navigate(`/conversations?lead=${l.id}`)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-dark-700/40"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-dark-700 text-[11.5px] font-bold text-white">
                        {initials(l.name, l.phone)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-medium text-white">{l.name ?? l.phone}</p>
                          {isUrgent && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9.5px] font-medium text-red-400">
                              <AlertCircle className="h-2 w-2" /> Urgente
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                          <span className={`inline-flex items-center gap-1 ${meta.text}`}>
                            <span className={`h-1 w-1 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                          {l.treatment_interest && (
                            <>
                              <span className="text-zinc-700">·</span>
                              <span className="truncate">{l.treatment_interest}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-base font-bold text-amber-400">{l.score}</span>
                        <span className="text-[10px] text-zinc-500">{formatRelative(l.last_message_at)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ── Col derecha (1/3): Pipeline + Quick actions + Upcoming ── */}
        <div className="space-y-5">
          {/* Quick actions */}
          <Card>
            <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-white">
              <Zap className="h-4 w-4 text-lime-400" />
              Acciones rápidas
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction
                icon={<Plus className="h-3.5 w-3.5" />}
                label="Nuevo lead"
                onClick={() => navigate('/leads')}
                primary
              />
              <QuickAction
                icon={<Calendar className="h-3.5 w-3.5" />}
                label="Nueva cita"
                onClick={() => navigate('/appointments')}
              />
              <QuickAction
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label="Conversaciones"
                onClick={() => navigate('/conversations')}
              />
              <QuickAction
                icon={<Cog className="h-3.5 w-3.5" />}
                label="Configurar"
                onClick={() => navigate('/settings')}
              />
            </div>
          </Card>

          {/* Mini funnel pipeline */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Activity className="h-4 w-4 text-sky-300" />
                Pipeline
              </h3>
              <button
                onClick={() => navigate('/leads')}
                className="text-[11px] text-zinc-500 hover:text-lime-400"
              >
                Ver leads
              </button>
            </div>
            <div className="space-y-2">
              {STAGE_ORDER.filter((s) => s !== 'lost').map((s) => {
                const meta = STAGE_META[s]!
                const count = pipelineCounts[s] ?? 0
                const pct = (count / maxPipelineCount) * 100
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className="w-20 shrink-0 text-[10.5px] text-zinc-400">{meta.label}</div>
                    <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-dark-900/60">
                      <div
                        className={`h-full rounded-md ${meta.dot} opacity-50 transition-all duration-700`}
                        style={{ width: `${pct}%`, minWidth: count > 0 ? '4px' : '0' }}
                      />
                      <div className="absolute inset-0 flex items-center px-2">
                        <span className={`text-[11px] font-semibold ${count > 0 ? 'text-white' : 'text-zinc-600'}`}>
                          {count}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {kpis.lost > 0 && (
                <div className="mt-3 flex items-center justify-between border-t border-dark-600 pt-3 text-[11px]">
                  <span className="inline-flex items-center gap-1 text-zinc-500">
                    <span className="h-1 w-1 rounded-full bg-red-400" />
                    Perdidos
                  </span>
                  <span className="text-zinc-500">{kpis.lost}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Upcoming next days */}
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-dark-600 px-4 py-2.5">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <CalendarDays className="h-4 w-4 text-emerald-400" />
                Próximas citas
              </h3>
              <button
                onClick={() => navigate('/appointments')}
                className="text-[11px] text-zinc-500 hover:text-lime-400"
              >
                Ver todas
              </button>
            </div>
            {upcomingAppts.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <CircleDashed className="mx-auto mb-2 h-5 w-5 text-zinc-600" />
                <p className="text-[12px] text-zinc-500">Sin citas próximas</p>
              </div>
            ) : (
              <div className="divide-y divide-dark-600">
                {upcomingAppts.map((a) => {
                  const lead = leadsMap.get(a.lead_id)
                  const d = new Date(a.scheduled_at)
                  return (
                    <button
                      key={a.id}
                      onClick={() => navigate('/appointments')}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-dark-700/40"
                    >
                      <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-emerald-500/10">
                        <div className="text-[9px] font-medium uppercase text-emerald-400">
                          {d.toLocaleDateString('es-MX', { month: 'short' })}
                        </div>
                        <div className="-mt-0.5 text-sm font-bold text-emerald-400">{d.getDate()}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-white">
                          {lead?.name ?? lead?.phone ?? 'Paciente'}
                        </p>
                        <p className="text-[10.5px] text-zinc-500">
                          {formatTime(a.scheduled_at)} · {a.treatment ?? 'Consulta'}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

// ============================================================
//  Subcomponentes
// ============================================================
function StatusBadge({
  connected, connectedLabel, disconnectedLabel, connectedIcon, disconnectedIcon, onClick,
}: {
  connected: boolean
  connectedLabel: string
  disconnectedLabel: string
  connectedIcon: React.ReactNode
  disconnectedIcon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors ${
        connected
          ? 'bg-lime-500/10 text-lime-400 ring-lime-500/20 hover:bg-lime-500/15'
          : 'bg-amber-500/10 text-amber-300 ring-amber-500/20 hover:bg-amber-500/15'
      }`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${connected ? 'bg-lime-400' : 'bg-amber-400'}`} />
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${connected ? 'bg-lime-400' : 'bg-amber-400'}`} />
      </span>
      {connected ? connectedIcon : disconnectedIcon}
      {connected ? connectedLabel : disconnectedLabel}
    </button>
  )
}

function KpiCard({
  label, value, icon, color = 'lime', hint, delta, deltaLabel, onClick,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  color?: 'lime' | 'sky' | 'amber' | 'red' | 'zinc'
  hint?: string
  delta?: number | null
  deltaLabel?: string
  onClick?: () => void
}) {
  const colors = {
    lime: 'text-lime-400 bg-lime-500/10 ring-lime-500/20',
    sky: 'text-sky-300 bg-sky-500/10 ring-sky-500/20',
    amber: 'text-amber-300 bg-amber-500/10 ring-amber-500/20',
    red: 'text-red-400 bg-red-500/10 ring-red-500/20',
    zinc: 'text-zinc-400 bg-dark-600 ring-white/[0.04]',
  }
  return (
    <button
      onClick={onClick}
      className="group block rounded-2xl border border-white/[0.06] bg-dark-800 p-5 text-left transition-all duration-200 hover:border-white/[0.12] hover:bg-dark-800/90 hover:shadow-lg hover:shadow-black/20"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
          <p className="mt-1.5 text-3xl font-bold tracking-tight text-white">{value}</p>
          <div className="mt-1 flex items-center gap-2">
            {delta !== undefined && delta !== null && (
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
                delta > 0 ? 'text-lime-400' : delta < 0 ? 'text-red-400' : 'text-zinc-500'
              }`}>
                {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                {delta > 0 ? '+' : ''}{delta}%
              </span>
            )}
            {(hint || deltaLabel) && (
              <span className="truncate text-[11px] text-zinc-500">{deltaLabel ?? hint}</span>
            )}
          </div>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover:scale-110 ${colors[color]}`}>
          {icon}
        </div>
      </div>
    </button>
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
      className={`group inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
        primary
          ? 'bg-lime-500 text-dark-900 hover:bg-lime-400'
          : 'border border-dark-500 bg-dark-700 text-zinc-200 hover:border-dark-400 hover:bg-dark-600 hover:text-white'
      }`}
    >
      {icon}
      {label}
      <ArrowRight className={`h-3 w-3 transition-transform group-hover:translate-x-0.5 ${primary ? 'text-dark-900/60' : 'text-zinc-500'}`} />
    </button>
  )
}

// Phone import kept to avoid unused warning on link route changes
void Phone
