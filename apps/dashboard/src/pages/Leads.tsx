import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import Input from '@/components/Input'
import { Search, Plus, Phone, Mail, ChevronRight } from 'lucide-react'

interface Lead {
  id: string; name: string | null; phone: string; email: string | null
  stage: string; score: number; urgency_level: string
  treatment_interest: string | null; notes: string | null
  source: string; last_message_at: string | null; created_at: string
}

const STAGES = ['new', 'contacted', 'warm', 'interested', 'scheduled', 'attended', 'recurring', 'lost']
const STAGE_LABELS: Record<string, string> = {
  new: 'Nuevo', contacted: 'Contactado', warm: 'Tibio', interested: 'Interesado',
  scheduled: 'Agendado', attended: 'Atendido', recurring: 'Recurrente', lost: 'Perdido',
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', phone: '', email: '', treatment_interest: '' })
  const [creating, setCreating] = useState(false)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '100', order: 'recent' })
    if (search) params.set('search', search)
    if (stageFilter) params.set('stage', stageFilter)
    const res = await api.get<{ leads: Lead[]; total: number }>(`/api/leads?${params}`)
    if (res.data) {
      setLeads(res.data.leads)
      setTotal(res.data.total)
    }
    setLoading(false)
  }, [search, stageFilter])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    const body: Record<string, string> = { phone: createForm.phone }
    if (createForm.name) body.name = createForm.name
    if (createForm.email) body.email = createForm.email
    if (createForm.treatment_interest) body.treatment_interest = createForm.treatment_interest
    await api.post('/api/leads', body)
    setCreating(false)
    setShowCreate(false)
    setCreateForm({ name: '', phone: '', email: '', treatment_interest: '' })
    fetchLeads()
  }

  const handleStageUpdate = async (id: string, stage: string) => {
    await api.patch(`/api/leads/${id}`, { stage })
    if (selected?.id === id) setSelected({ ...selected, stage })
    fetchLeads()
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Leads"
        subtitle={`${total} pacientes en tu pipeline`}
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Nuevo lead
          </Button>
        }
      />

      {/* Filtros */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="w-full rounded-lg border border-dark-500 bg-dark-700 py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setStageFilter('')}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              !stageFilter ? 'bg-lime-500/20 text-lime-400' : 'text-zinc-500 hover:text-white'
            }`}
          >
            Todos
          </button>
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(stageFilter === s ? '' : s)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                stageFilter === s ? 'bg-lime-500/20 text-lime-400' : 'text-zinc-500 hover:text-white'
              }`}
            >
              {STAGE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de leads */}
      <Card className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" />
          </div>
        ) : leads.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-zinc-500">No se encontraron leads</p>
          </div>
        ) : (
          <div className="divide-y divide-dark-600">
            {leads.map((lead) => (
              <div
                key={lead.id}
                onClick={() => setSelected(lead)}
                className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-dark-700"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dark-600 text-sm font-semibold text-lime-400">
                  {(lead.name ?? lead.phone).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {lead.name ?? lead.phone}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {lead.treatment_interest ?? lead.phone}
                  </p>
                </div>
                <div className="hidden items-center gap-3 sm:flex">
                  <div className="text-right">
                    <p className="text-xs text-zinc-500">Score</p>
                    <p className="text-sm font-semibold text-white">{lead.score}</p>
                  </div>
                  <Badge stage={lead.stage}>{STAGE_LABELS[lead.stage] ?? lead.stage}</Badge>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-600" />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal de detalle */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? 'Lead'}>
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-dark-700 p-3">
                <p className="text-xs text-zinc-500">Teléfono</p>
                <a href={`tel:${selected.phone}`} className="flex items-center gap-1 text-sm text-lime-400">
                  <Phone className="h-3 w-3" /> {selected.phone}
                </a>
              </div>
              <div className="rounded-lg bg-dark-700 p-3">
                <p className="text-xs text-zinc-500">Email</p>
                {selected.email ? (
                  <a href={`mailto:${selected.email}`} className="flex items-center gap-1 text-sm text-lime-400">
                    <Mail className="h-3 w-3" /> {selected.email}
                  </a>
                ) : (
                  <p className="text-sm text-zinc-500">—</p>
                )}
              </div>
              <div className="rounded-lg bg-dark-700 p-3">
                <p className="text-xs text-zinc-500">Interés</p>
                <p className="text-sm text-white">{selected.treatment_interest ?? '—'}</p>
              </div>
              <div className="rounded-lg bg-dark-700 p-3">
                <p className="text-xs text-zinc-500">Score</p>
                <p className="text-sm font-bold text-lime-400">{selected.score}/100</p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-zinc-400">Etapa</p>
              <div className="flex flex-wrap gap-1.5">
                {STAGES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStageUpdate(selected.id, s)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      selected.stage === s
                        ? 'bg-lime-500 text-dark-900'
                        : 'bg-dark-600 text-zinc-400 hover:bg-dark-500 hover:text-white'
                    }`}
                  >
                    {STAGE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {selected.notes && (
              <div>
                <p className="mb-1 text-xs font-medium text-zinc-400">Notas</p>
                <p className="text-sm text-zinc-300">{selected.notes}</p>
              </div>
            )}

            <p className="text-xs text-zinc-600">
              Fuente: {selected.source} · Creado: {new Date(selected.created_at).toLocaleDateString('es-MX')}
            </p>
          </div>
        )}
      </Modal>

      {/* Modal crear lead */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo lead">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Nombre"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            placeholder="Nombre del paciente"
          />
          <Input
            label="Teléfono"
            value={createForm.phone}
            onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
            placeholder="+52 55 1234 5678"
            required
          />
          <Input
            label="Email"
            type="email"
            value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            placeholder="paciente@email.com"
          />
          <Input
            label="Interés de tratamiento"
            value={createForm.treatment_interest}
            onChange={(e) => setCreateForm({ ...createForm, treatment_interest: e.target.value })}
            placeholder="Blanqueamiento, implantes, etc."
          />
          <Button type="submit" loading={creating} className="w-full">
            Crear lead
          </Button>
        </form>
      </Modal>
    </div>
  )
}
