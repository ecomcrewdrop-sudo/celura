import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useClinic } from '@/hooks/useClinic'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import {
  Users,
  CalendarDays,
  MessageSquare,
  TrendingUp,
  ArrowRight,
  Clock,
} from 'lucide-react'

interface Lead {
  id: string; name: string | null; phone: string; stage: string; score: number
  treatment_interest: string | null; updated_at: string
}
interface Appointment {
  id: string; lead_id: string; scheduled_at: string; treatment: string | null
  status: string; duration_min: number
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

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={`${greeting()}, Dr.`}
        subtitle={clinic?.name ?? 'Cargando...'}
      />

      {/* Métricas */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card hover onClick={() => navigate('/leads')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">Total leads</p>
              <p className="mt-1 text-3xl font-bold text-white">{stats.total}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-lime-500/15">
              <Users className="h-5 w-5 text-lime-400" />
            </div>
          </div>
        </Card>
        <Card hover onClick={() => navigate('/leads?min_score=50')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">Leads calientes</p>
              <p className="mt-1 text-3xl font-bold text-amber-400">{stats.hot}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15">
              <TrendingUp className="h-5 w-5 text-amber-400" />
            </div>
          </div>
        </Card>
        <Card hover onClick={() => navigate('/appointments')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">Citas agendadas</p>
              <p className="mt-1 text-3xl font-bold text-emerald-400">{stats.scheduled}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15">
              <CalendarDays className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Dos columnas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Últimos leads */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Últimos leads</h2>
            <button
              onClick={() => navigate('/leads')}
              className="flex items-center gap-1 text-xs text-lime-400 hover:text-lime-300"
            >
              Ver todos <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {leads.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              Aún no hay leads. Conecta WhatsApp para empezar a recibir.
            </p>
          ) : (
            <div className="space-y-3">
              {leads.map((l) => (
                <div
                  key={l.id}
                  onClick={() => navigate(`/leads`)}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-dark-700"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {l.name ?? l.phone}
                    </p>
                    <p className="text-xs text-zinc-500">{l.treatment_interest ?? l.phone}</p>
                  </div>
                  <Badge stage={l.stage}>{l.stage}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Próximas citas */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Próximas citas</h2>
            <button
              onClick={() => navigate('/appointments')}
              className="flex items-center gap-1 text-xs text-lime-400 hover:text-lime-300"
            >
              Ver todas <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {appointments.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              Sin citas agendadas. Se crean automáticamente desde WhatsApp.
            </p>
          ) : (
            <div className="space-y-3">
              {appointments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-dark-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
                      <Clock className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {a.treatment ?? 'Consulta'}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(a.scheduled_at).toLocaleDateString('es-MX', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <Badge variant="emerald">{a.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Alertas */}
      {config && !config.wa_connected && (
        <div className="mt-6">
          <Card
            hover
            onClick={() => navigate('/whatsapp')}
            className="border-lime-500/30 bg-lime-500/5"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-lime-500/20">
                <MessageSquare className="h-5 w-5 text-lime-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Conecta WhatsApp</p>
                <p className="text-xs text-zinc-400">
                  Escanea el código QR para empezar a recibir pacientes automáticamente.
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-lime-400" />
            </div>
          </Card>
        </div>
      )}

      {config && !config.has_claude_key && (
        <div className="mt-4">
          <Card
            hover
            onClick={() => navigate('/settings')}
            className="border-amber-500/30 bg-amber-500/5"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20">
                <TrendingUp className="h-5 w-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Agrega tu API key de Claude</p>
                <p className="text-xs text-zinc-400">
                  Sin ella, el asistente usa respuestas predefinidas. Con tu key, responde con IA.
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-amber-400" />
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
