import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useClinic } from '@/hooks/useClinic'
import {
  Users,
  CalendarDays,
  MessageSquare,
  TrendingUp,
  ArrowRight,
  Clock,
  Smartphone,
  Zap,
} from 'lucide-react'

interface Lead {
  id: string; name: string | null; phone: string; stage: string; score: number
  treatment_interest: string | null; updated_at: string
}
interface Appointment {
  id: string; lead_id: string; scheduled_at: string; treatment: string | null
  status: string; duration_min: number
}

const STAGE_LABELS: Record<string, string> = {
  new: 'Nuevo', contacted: 'Contactado', warm: 'Tibio', interested: 'Interesado',
  scheduled: 'Agendado', attended: 'Atendido', recurring: 'Recurrente', lost: 'Perdido',
}
const STAGE_COLORS: Record<string, string> = {
  new: 'bg-lime-500/15 text-lime-400',
  contacted: 'bg-blue-500/15 text-blue-400',
  warm: 'bg-amber-500/15 text-amber-400',
  interested: 'bg-purple-500/15 text-purple-400',
  scheduled: 'bg-emerald-500/15 text-emerald-400',
  attended: 'bg-emerald-500/15 text-emerald-400',
  recurring: 'bg-lime-500/15 text-lime-400',
  lost: 'bg-red-500/15 text-red-400',
}

export default function DashboardHome() {
  const { clinic, config } = useClinic()
  const navigate = useNavigate()
  const [leads, setLeads] = useState<Lead[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [stats, setStats] = useState({ total: 0, hot: 0, scheduled: 0 })

  useEffect(() => {
    api.get<{ leads: Lead[]; total: number }>('/api/leads?order=recent&limit=5').then((r) => {
      if (r.data) {
        setLeads(r.data.leads)
        setStats((s) => ({ ...s, total: r.data!.total }))
      }
    })
    api.get<{ leads: Lead[]; total: number }>('/api/leads?min_score=50&limit=1').then((r) => {
      if (r.data) setStats((s) => ({ ...s, hot: r.data!.total }))
    })
    api.get<{ appointments: Appointment[]; total: number }>('/api/appointments?status=scheduled&order=upcoming&limit=5').then((r) => {
      if (r.data) {
        setAppointments(r.data.appointments)
        setStats((s) => ({ ...s, scheduled: r.data!.total }))
      }
    })
  }, [])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 18) return 'Buenas tardes'
    return 'Buenas noches'
  }

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[13px] font-medium capitalize text-zinc-500">{today}</p>
        <h1 className="mt-1 text-[1.75rem] font-bold tracking-tight text-white">
          {greeting()}, Dr.
        </h1>
        <p className="mt-0.5 text-sm text-zinc-600">{clinic?.name}</p>
      </div>

      {/* Metrics */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            label: 'Total leads',
            value: stats.total,
            icon: Users,
            color: 'lime',
            onClick: () => navigate('/leads'),
          },
          {
            label: 'Leads calientes',
            value: stats.hot,
            icon: TrendingUp,
            color: 'amber',
            onClick: () => navigate('/leads?min_score=50'),
          },
          {
            label: 'Citas agendadas',
            value: stats.scheduled,
            icon: CalendarDays,
            color: 'emerald',
            onClick: () => navigate('/appointments'),
          },
        ].map((metric) => (
          <button
            key={metric.label}
            onClick={metric.onClick}
            className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-dark-800 p-6 text-left transition-all duration-300 hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/25"
          >
            <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${
              metric.color === 'lime' ? 'via-lime-500/40' :
              metric.color === 'amber' ? 'via-amber-500/40' :
              'via-emerald-500/40'
            } to-transparent`} />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] font-medium text-zinc-500">{metric.label}</p>
                <p className={`mt-3 text-4xl font-bold tracking-tight ${
                  metric.color === 'lime' ? 'text-white' :
                  metric.color === 'amber' ? 'text-amber-400' :
                  'text-emerald-400'
                }`}>{metric.value}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                metric.color === 'lime' ? 'bg-lime-500/10 text-lime-400' :
                metric.color === 'amber' ? 'bg-amber-500/10 text-amber-400' :
                'bg-emerald-500/10 text-emerald-400'
              } transition-transform duration-300 group-hover:scale-110`}>
                <metric.icon className="h-5 w-5" />
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Latest leads */}
        <div className="rounded-2xl border border-white/[0.06] bg-dark-800">
          <div className="flex items-center justify-between px-6 py-4">
            <h2 className="text-sm font-semibold text-white">Últimos leads</h2>
            <button
              onClick={() => navigate('/leads')}
              className="flex items-center gap-1 text-xs font-medium text-zinc-500 transition-colors hover:text-lime-400"
            >
              Ver todos <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="border-t border-white/[0.04]">
            {leads.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Users className="mx-auto mb-3 h-8 w-8 text-zinc-700" />
                <p className="text-sm text-zinc-500">
                  Aún no hay leads
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  Conecta WhatsApp para empezar a recibir.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {leads.map((l) => (
                  <div
                    key={l.id}
                    onClick={() => navigate('/leads')}
                    className="flex cursor-pointer items-center gap-4 px-6 py-3.5 transition-colors hover:bg-white/[0.02]"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-zinc-300">
                      {(l.name ?? l.phone).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {l.name ?? l.phone}
                      </p>
                      <p className="truncate text-xs text-zinc-600">{l.treatment_interest ?? l.phone}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      STAGE_COLORS[l.stage] ?? 'bg-zinc-500/15 text-zinc-400'
                    }`}>
                      {STAGE_LABELS[l.stage] ?? l.stage}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming appointments */}
        <div className="rounded-2xl border border-white/[0.06] bg-dark-800">
          <div className="flex items-center justify-between px-6 py-4">
            <h2 className="text-sm font-semibold text-white">Próximas citas</h2>
            <button
              onClick={() => navigate('/appointments')}
              className="flex items-center gap-1 text-xs font-medium text-zinc-500 transition-colors hover:text-lime-400"
            >
              Ver todas <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="border-t border-white/[0.04]">
            {appointments.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <CalendarDays className="mx-auto mb-3 h-8 w-8 text-zinc-700" />
                <p className="text-sm text-zinc-500">
                  Sin citas agendadas
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  Se crean automáticamente desde WhatsApp.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {appointments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-white/[0.02]"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                      <Clock className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {a.treatment ?? 'Consulta'}
                      </p>
                      <p className="text-xs text-zinc-600">
                        {new Date(a.scheduled_at).toLocaleDateString('es-MX', {
                          weekday: 'short', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action cards */}
      {(() => {
        const providerKeyMissing = config
          ? (config.ai_provider === 'openai' ? !config.has_openai_key : !config.has_claude_key)
          : false
        return config && (!config.wa_connected || providerKeyMissing) && (
        <div className="mt-6 space-y-3">
          {!config.wa_connected && (
            <button
              onClick={() => navigate('/whatsapp')}
              className="group flex w-full items-center gap-5 rounded-2xl border border-lime-500/15 bg-lime-500/[0.04] px-6 py-5 text-left transition-all duration-200 hover:border-lime-500/25 hover:bg-lime-500/[0.07]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-lime-500/15 transition-transform duration-300 group-hover:scale-110">
                <Smartphone className="h-6 w-6 text-lime-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Conecta WhatsApp</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Escanea el código QR para empezar a recibir pacientes automáticamente.
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-lime-400/60 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          )}

          {providerKeyMissing && (
            <button
              onClick={() => navigate('/settings')}
              className="group flex w-full items-center gap-5 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] px-6 py-5 text-left transition-all duration-200 hover:border-amber-500/25 hover:bg-amber-500/[0.07]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 transition-transform duration-300 group-hover:scale-110">
                <Zap className="h-6 w-6 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">
                  Agrega tu API key de {config.ai_provider === 'openai' ? 'OpenAI (ChatGPT)' : 'Claude'}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Sin ella, el asistente usa respuestas predefinidas. Con tu key, responde con IA.
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-amber-400/60 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          )}
        </div>
        )
      })()}
    </div>
  )
}
