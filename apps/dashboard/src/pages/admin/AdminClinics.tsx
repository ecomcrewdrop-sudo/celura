import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Search, Filter, X, MoreVertical, Smartphone, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import AdminClinicDrawer from './AdminClinicDrawer'

interface ClinicRow {
  clinic_id: string
  clinic_name: string
  slug: string
  owner_id: string
  plan: 'trial' | 'esencial' | 'pro' | 'clinica'
  status: 'active' | 'suspended' | 'cancelled' | 'trial'
  is_beta: boolean
  country: string | null
  city: string | null
  trial_ends_at: string | null
  created_at: string
  wa_connected: boolean | null
  wa_phone: string | null
  ai_provider: 'claude' | 'openai' | null
  has_ai_key: boolean
  leads_total: number
  leads_7d: number
  appts_upcoming: number
  appts_attended: number
  tokens_total: number
  last_lead_activity: string | null
}

interface ListRes {
  items: ClinicRow[]
  total: number
  limit: number
  offset: number
}

export default function AdminClinics() {
  const [items, setItems] = useState<ClinicRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [plan, setPlan] = useState('')
  const [status, setStatus] = useState('')
  const [waFilter, setWaFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (plan) params.set('plan', plan)
    if (status) params.set('status', status)
    if (waFilter) params.set('wa', waFilter)
    params.set('limit', '100')
    const res = await api.get<ListRes>(`/admin/clinics?${params.toString()}`)
    if (res.data) {
      setItems(res.data.items)
      setTotal(res.data.total)
    }
    setLoading(false)
  }, [q, plan, status, waFilter])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Clínicas</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {total.toLocaleString()} cuentas registradas. Click en una fila para acciones.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-dark-800 p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, slug o teléfono…"
            className="h-9 w-full rounded-lg border border-white/[0.06] bg-dark-700 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-violet-400/30 focus:outline-none"
          />
        </div>

        <Select value={plan} onChange={setPlan} placeholder="Plan">
          <option value="">Todos los planes</option>
          <option value="trial">Trial</option>
          <option value="esencial">Esencial</option>
          <option value="pro">Pro</option>
          <option value="clinica">Clínica</option>
        </Select>

        <Select value={status} onChange={setStatus} placeholder="Estado">
          <option value="">Todos</option>
          <option value="active">Activa</option>
          <option value="suspended">Suspendida</option>
          <option value="cancelled">Cancelada</option>
        </Select>

        <Select value={waFilter} onChange={setWaFilter} placeholder="WhatsApp">
          <option value="">WA: cualquiera</option>
          <option value="true">Conectado</option>
          <option value="false">No conectado</option>
        </Select>

        {(q || plan || status || waFilter) && (
          <button
            onClick={() => {
              setQ('')
              setPlan('')
              setStatus('')
              setWaFilter('')
            }}
            className="flex h-9 items-center gap-1 rounded-lg border border-white/[0.06] bg-dark-700 px-3 text-xs text-zinc-400 hover:bg-white/[0.04]"
          >
            <X className="h-3 w-3" />
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-dark-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/[0.06] bg-white/[0.02]">
            <tr className="text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 font-medium">Clínica</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">WhatsApp</th>
              <th className="px-4 py-3 font-medium">Leads</th>
              <th className="px-4 py-3 font-medium">Tokens</th>
              <th className="px-4 py-3 font-medium">Trial</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-white/[0.04]">
                  <td colSpan={8} className="px-4 py-3">
                    <div className="h-6 animate-pulse rounded bg-white/[0.03]" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-zinc-500">
                  <Filter className="mx-auto h-6 w-6 text-zinc-600" />
                  <p className="mt-2">Ninguna clínica matchea los filtros.</p>
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr
                  key={c.clinic_id}
                  onClick={() => setSelectedId(c.clinic_id)}
                  className="cursor-pointer border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-white">{c.clinic_name}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {[c.city, c.country].filter(Boolean).join(' · ') || c.slug}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge plan={c.plan} beta={c.is_beta} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3">
                    {c.wa_connected ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-lime-400">
                        <Smartphone className="h-3 w-3" />
                        {c.wa_phone ?? 'conectado'}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-600">no conectado</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {c.leads_total.toLocaleString()}
                    {c.leads_7d > 0 && (
                      <span className="ml-1 text-[10px] text-lime-400">+{c.leads_7d}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{c.tokens_total.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {c.trial_ends_at ? formatTrial(c.trial_ends_at) : '—'}
                  </td>
                  <td className="px-2 py-3">
                    <MoreVertical className="h-4 w-4 text-zinc-600" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <AdminClinicDrawer
          clinicId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-white/[0.06] bg-dark-700 px-3 text-xs text-zinc-300 focus:border-violet-400/30 focus:outline-none"
    >
      {children}
    </select>
  )
}

function PlanBadge({ plan, beta }: { plan: string; beta: boolean }) {
  const styles: Record<string, string> = {
    pro: 'bg-lime-500/15 text-lime-300',
    clinica: 'bg-violet-500/15 text-violet-300',
    esencial: 'bg-sky-500/15 text-sky-300',
    trial: 'bg-amber-500/15 text-amber-300',
  }
  return (
    <div className="flex items-center gap-1">
      <span
        className={clsx(
          'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
          styles[plan] ?? 'bg-zinc-500/15 text-zinc-300',
        )}
      >
        {plan}
      </span>
      {beta && (
        <span className="inline-flex items-center gap-0.5 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
          <Sparkles className="h-2.5 w-2.5" />
          Beta
        </span>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-lime-500/15 text-lime-300',
    suspended: 'bg-red-500/15 text-red-300',
    cancelled: 'bg-zinc-500/15 text-zinc-400',
    trial: 'bg-amber-500/15 text-amber-300',
  }
  const labels: Record<string, string> = {
    active: 'Activa',
    suspended: 'Suspendida',
    cancelled: 'Cancelada',
    trial: 'Trial',
  }
  return (
    <span
      className={clsx(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        styles[status] ?? 'bg-zinc-500/15 text-zinc-300',
      )}
    >
      {labels[status] ?? status}
    </span>
  )
}

function formatTrial(iso: string): string {
  const end = new Date(iso)
  const days = Math.round((end.getTime() - Date.now()) / 86_400_000)
  if (days < 0) return `vencido hace ${Math.abs(days)}d`
  if (days === 0) return 'vence hoy'
  return `${days}d restantes`
}
