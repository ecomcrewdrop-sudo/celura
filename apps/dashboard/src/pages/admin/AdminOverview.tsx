import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import {
  Building2,
  Users,
  Smartphone,
  CalendarDays,
  TrendingUp,
  ShieldAlert,
  Megaphone,
  Sparkles,
} from 'lucide-react'

interface Overview {
  clinics: {
    total: number
    active: number
    trial: number
    suspended: number
    beta: number
    new_7d: number
    wa_connected: number
  }
  leads: { total: number; new_7d: number }
  appointments: { upcoming: number }
  announcements: { active: number }
}

export default function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Overview>('/admin/overview').then((r) => {
      setData(r.data)
      setLoading(false)
    })
  }, [])

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-white/[0.04]" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Vista global</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Estado del sistema en tiempo real. Cada métrica enlaza al detalle.
        </p>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Building2}
          label="Clínicas activas"
          value={data.clinics.active}
          sub={`${data.clinics.total} totales`}
          color="lime"
        />
        <Kpi
          icon={Sparkles}
          label="En trial"
          value={data.clinics.trial}
          sub={`${data.clinics.beta} beta`}
          color="amber"
        />
        <Kpi
          icon={Smartphone}
          label="WhatsApp conectado"
          value={data.clinics.wa_connected}
          sub={`${pct(data.clinics.wa_connected, data.clinics.total)}% del total`}
          color="sky"
        />
        <Kpi
          icon={ShieldAlert}
          label="Suspendidas"
          value={data.clinics.suspended}
          sub={data.clinics.suspended > 0 ? 'requiere revisión' : 'todo en orden'}
          color={data.clinics.suspended > 0 ? 'red' : 'zinc'}
        />
        <Kpi
          icon={Users}
          label="Leads totales"
          value={data.leads.total}
          sub={`+${data.leads.new_7d} esta semana`}
          color="violet"
        />
        <Kpi
          icon={CalendarDays}
          label="Citas próximas"
          value={data.appointments.upcoming}
          sub="pendientes/confirmadas"
          color="sky"
        />
        <Kpi
          icon={TrendingUp}
          label="Nuevas clínicas 7d"
          value={data.clinics.new_7d}
          sub="crecimiento reciente"
          color="lime"
        />
        <Kpi
          icon={Megaphone}
          label="Anuncios activos"
          value={data.announcements.active}
          sub="visibles a doctores"
          color="violet"
        />
      </div>

      {/* Salud del sistema */}
      <div className="rounded-2xl border border-white/[0.06] bg-dark-800 p-5">
        <h2 className="text-sm font-semibold text-white">Salud del sistema</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Indicadores que muestran si todo está fluyendo como debe.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <HealthRow
            label="Cobertura de WhatsApp"
            value={`${pct(data.clinics.wa_connected, data.clinics.active)}%`}
            healthy={pct(data.clinics.wa_connected, data.clinics.active) >= 70}
          />
          <HealthRow
            label="Clínicas suspendidas"
            value={data.clinics.suspended.toString()}
            healthy={data.clinics.suspended === 0}
          />
          <HealthRow
            label="Trial vs pagas"
            value={`${data.clinics.trial} / ${data.clinics.active - data.clinics.trial}`}
            healthy
          />
        </div>
      </div>
    </div>
  )
}

function pct(num: number, den: number): number {
  if (!den) return 0
  return Math.round((num / den) * 100)
}

type Color = 'lime' | 'sky' | 'violet' | 'amber' | 'red' | 'zinc'
const COLOR_MAP: Record<Color, { bg: string; text: string }> = {
  lime: { bg: 'bg-lime-500/10', text: 'text-lime-400' },
  sky: { bg: 'bg-sky-500/10', text: 'text-sky-400' },
  violet: { bg: 'bg-violet-500/10', text: 'text-violet-400' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  red: { bg: 'bg-red-500/10', text: 'text-red-400' },
  zinc: { bg: 'bg-white/[0.04]', text: 'text-zinc-400' },
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  sub: string
  color: Color
}) {
  const c = COLOR_MAP[color]
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-dark-800 p-4">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.bg} ${c.text}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value.toLocaleString()}</p>
      <p className="mt-1 text-[11px] text-zinc-500">{sub}</p>
    </div>
  )
}

function HealthRow({
  label,
  value,
  healthy,
}: {
  label: string
  value: string
  healthy: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-dark-700/40 px-4 py-3">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-white">{value}</p>
      </div>
      <span
        className={`h-2 w-2 rounded-full ${
          healthy ? 'bg-lime-400 shadow-[0_0_10px_rgba(132,204,22,0.5)]' : 'bg-amber-400'
        }`}
      />
    </div>
  )
}
