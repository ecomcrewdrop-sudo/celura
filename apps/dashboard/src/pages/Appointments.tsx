import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import Input from '@/components/Input'
import { Plus, Calendar, Clock, Trash2 } from 'lucide-react'

interface Appointment {
  id: string; lead_id: string; scheduled_at: string; duration_min: number
  treatment: string | null; status: string; notes: string | null
  created_at: string
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada', confirmed: 'Confirmada', attended: 'Atendida',
  no_show: 'No asistió', cancelled: 'Cancelada', rescheduled: 'Reagendada',
}
const STATUS_COLORS: Record<string, string> = {
  scheduled: 'blue', confirmed: 'emerald', attended: 'lime',
  no_show: 'red', cancelled: 'zinc', rescheduled: 'amber',
}

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ lead_id: '', scheduled_at: '', duration_min: '60', treatment: '', notes: '' })
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Appointment | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '100', order: 'upcoming' })
    if (statusFilter) params.set('status', statusFilter)
    const res = await api.get<{ appointments: Appointment[]; total: number }>(`/api/appointments?${params}`)
    if (res.data) { setAppointments(res.data.appointments); setTotal(res.data.total) }
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { fetch() }, [fetch])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    await api.post('/api/appointments', {
      lead_id: form.lead_id,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      duration_min: parseInt(form.duration_min),
      treatment: form.treatment || undefined,
      notes: form.notes || undefined,
    })
    setCreating(false)
    setShowCreate(false)
    setForm({ lead_id: '', scheduled_at: '', duration_min: '60', treatment: '', notes: '' })
    fetch()
  }

  const updateStatus = async (id: string, status: string) => {
    await api.patch(`/api/appointments/${id}`, { status })
    setSelected(null)
    fetch()
  }

  const cancelAppt = async (id: string) => {
    await api.delete(`/api/appointments/${id}`)
    setSelected(null)
    fetch()
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-MX', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Citas"
        subtitle={`${total} citas en total`}
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Nueva cita
          </Button>
        }
      />

      {/* Filtros */}
      <div className="mb-6 flex gap-1.5">
        {['', 'scheduled', 'confirmed', 'attended', 'no_show', 'cancelled'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              statusFilter === s ? 'bg-lime-500/20 text-lime-400' : 'text-zinc-500 hover:text-white'
            }`}
          >
            {s ? STATUS_LABELS[s] : 'Todas'}
          </button>
        ))}
      </div>

      <Card className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" />
          </div>
        ) : appointments.length === 0 ? (
          <div className="py-16 text-center">
            <Calendar className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
            <p className="text-sm text-zinc-500">No hay citas</p>
          </div>
        ) : (
          <div className="divide-y divide-dark-600">
            {appointments.map((a) => (
              <div
                key={a.id}
                onClick={() => setSelected(a)}
                className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-dark-700"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-dark-600">
                  <Clock className="h-5 w-5 text-lime-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {a.treatment ?? 'Consulta'} · {a.duration_min} min
                  </p>
                  <p className="text-xs text-zinc-500">{formatDate(a.scheduled_at)}</p>
                </div>
                <Badge variant={STATUS_COLORS[a.status]}>
                  {STATUS_LABELS[a.status] ?? a.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal detalle */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Detalle de cita">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-dark-700 p-3">
                <p className="text-xs text-zinc-500">Fecha</p>
                <p className="text-sm text-white">{formatDate(selected.scheduled_at)}</p>
              </div>
              <div className="rounded-lg bg-dark-700 p-3">
                <p className="text-xs text-zinc-500">Duración</p>
                <p className="text-sm text-white">{selected.duration_min} min</p>
              </div>
              <div className="rounded-lg bg-dark-700 p-3">
                <p className="text-xs text-zinc-500">Tratamiento</p>
                <p className="text-sm text-white">{selected.treatment ?? '—'}</p>
              </div>
              <div className="rounded-lg bg-dark-700 p-3">
                <p className="text-xs text-zinc-500">Estado</p>
                <Badge variant={STATUS_COLORS[selected.status]}>
                  {STATUS_LABELS[selected.status]}
                </Badge>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-zinc-400">Cambiar estado</p>
              <div className="flex flex-wrap gap-1.5">
                {['scheduled', 'confirmed', 'attended', 'no_show'].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(selected.id, s)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      selected.status === s
                        ? 'bg-lime-500 text-dark-900'
                        : 'bg-dark-600 text-zinc-400 hover:bg-dark-500'
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <Button variant="danger" onClick={() => cancelAppt(selected.id)} className="w-full">
              <Trash2 className="h-4 w-4" /> Cancelar cita
            </Button>
          </div>
        )}
      </Modal>

      {/* Modal crear */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nueva cita">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="ID del lead"
            value={form.lead_id}
            onChange={(e) => setForm({ ...form, lead_id: e.target.value })}
            placeholder="UUID del lead"
            required
          />
          <Input
            label="Fecha y hora"
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            required
          />
          <Input
            label="Duración (minutos)"
            type="number"
            value={form.duration_min}
            onChange={(e) => setForm({ ...form, duration_min: e.target.value })}
          />
          <Input
            label="Tratamiento"
            value={form.treatment}
            onChange={(e) => setForm({ ...form, treatment: e.target.value })}
            placeholder="Blanqueamiento, implantes, etc."
          />
          <Button type="submit" loading={creating} className="w-full">
            Agendar cita
          </Button>
        </form>
      </Modal>
    </div>
  )
}
