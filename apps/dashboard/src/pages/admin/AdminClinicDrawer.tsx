import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import {
  X,
  ShieldOff,
  Shield,
  CalendarClock,
  Crown,
  Sparkles,
  Smartphone,
  RotateCcw,
  Mail,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import clsx from 'clsx'

interface Detail {
  clinic: {
    clinic_id: string
    clinic_name: string
    slug: string
    plan: 'trial' | 'esencial' | 'pro' | 'clinica'
    status: 'active' | 'suspended' | 'cancelled' | 'trial'
    is_beta: boolean
    trial_ends_at: string | null
    created_at: string
    wa_connected: boolean | null
    wa_phone: string | null
    leads_total: number
    appts_upcoming: number
    appts_attended: number
    tokens_total: number
    ai_provider: string | null
    has_ai_key: boolean
    last_lead_activity: string | null
  }
  owner: {
    id: string
    email: string
    full_name: string | null
    last_sign_in_at: string | null
    created_at: string
  } | null
  blocks: Array<{
    id: string
    reason: string
    blocked_at: string
    unblocked_at: string | null
    notes: string | null
  }>
  recent_logs: Array<{
    id: string
    action: string
    payload: Record<string, unknown>
    created_at: string
  }>
  wa_runtime_status: string
}

const PLANS: Array<Detail['clinic']['plan']> = ['trial', 'esencial', 'pro', 'clinica']

export default function AdminClinicDrawer({
  clinicId,
  onClose,
  onChanged,
}: {
  clinicId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [data, setData] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = async () => {
    const res = await api.get<Detail>(`/admin/clinics/${clinicId}`)
    setData(res.data)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2400)
  }

  const doPatch = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true)
    const res = await api.patch(`/admin/clinics/${clinicId}`, body)
    setBusy(false)
    if (res.error) return flash('Error: ' + res.error)
    flash(msg)
    await load()
    onChanged()
  }

  const extendTrial = async (days: number) => {
    setBusy(true)
    const res = await api.post(`/admin/clinics/${clinicId}/extend-trial`, { days })
    setBusy(false)
    if (res.error) return flash('Error: ' + res.error)
    flash(`Trial extendido ${days} días`)
    await load()
    onChanged()
  }

  const block = async () => {
    const reason = window.prompt('Motivo del bloqueo (visible en auditoría):')
    if (!reason || reason.length < 3) return
    setBusy(true)
    const res = await api.post(`/admin/clinics/${clinicId}/block`, { reason })
    setBusy(false)
    if (res.error) return flash('Error: ' + res.error)
    flash('Clínica suspendida')
    await load()
    onChanged()
  }

  const unblock = async () => {
    if (!window.confirm('¿Reactivar esta clínica?')) return
    setBusy(true)
    const res = await api.post(`/admin/clinics/${clinicId}/unblock`, {})
    setBusy(false)
    if (res.error) return flash('Error: ' + res.error)
    flash('Clínica reactivada')
    await load()
    onChanged()
  }

  const resetWa = async () => {
    if (!window.confirm('¿Forzar desconexión de WhatsApp? El doctor tendrá que escanear QR de nuevo.')) return
    setBusy(true)
    const res = await api.post(`/admin/clinics/${clinicId}/reset-wa`, {})
    setBusy(false)
    if (res.error) return flash('Error: ' + res.error)
    flash('Sesión WhatsApp reseteada')
    await load()
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="hidden flex-1 bg-black/50 backdrop-blur-sm md:block" onClick={onClose} />
      <aside className="safe-pb relative flex h-dscreen w-full flex-col overflow-y-auto border-white/[0.06] bg-dark-800 shadow-2xl md:h-full md:max-w-xl md:border-l">
        {/* Header */}
        <div className="safe-pt sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-dark-800/95 px-5 py-4 backdrop-blur sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">
              {data?.clinic.clinic_name ?? 'Cargando…'}
            </p>
            <p className="truncate text-[11px] text-zinc-500">{data?.clinic.slug}</p>
          </div>
          <button
            onClick={onClose}
            className="touch-target -mr-1.5 flex shrink-0 items-center justify-center rounded-lg p-2 text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-200 sm:mx-6">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {toast}
          </div>
        )}

        {!data ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6 px-5 py-5 sm:px-6">
            {/* Dueño */}
            {data.owner && (
              <Section title="Dueño">
                <div className="rounded-xl border border-white/[0.04] bg-dark-700/50 p-4">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-zinc-500" />
                    <p className="text-sm text-zinc-200">{data.owner.email}</p>
                  </div>
                  {data.owner.full_name && (
                    <p className="mt-1 text-xs text-zinc-500">{data.owner.full_name}</p>
                  )}
                  <p className="mt-2 text-[11px] text-zinc-600">
                    Último login: {data.owner.last_sign_in_at
                      ? new Date(data.owner.last_sign_in_at).toLocaleString()
                      : 'nunca'}
                  </p>
                </div>
              </Section>
            )}

            {/* Stats */}
            <Section title="Métricas">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Leads" value={data.clinic.leads_total.toLocaleString()} />
                <Stat label="Tokens" value={data.clinic.tokens_total.toLocaleString()} />
                <Stat label="Citas próximas" value={data.clinic.appts_upcoming.toString()} />
                <Stat label="Citas atendidas" value={data.clinic.appts_attended.toString()} />
              </div>
            </Section>

            {/* Plan + acciones rápidas */}
            <Section title="Plan y suscripción">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.04] bg-dark-700/50 p-3">
                  <Crown className="h-3.5 w-3.5 text-violet-300" />
                  <span className="text-xs text-zinc-400">Plan actual:</span>
                  <select
                    value={data.clinic.plan}
                    disabled={busy}
                    onChange={(e) =>
                      doPatch({ plan: e.target.value }, `Plan cambiado a ${e.target.value}`)
                    }
                    className="h-8 rounded-lg border border-white/[0.06] bg-dark-700 px-2 text-xs text-white"
                  >
                    {PLANS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      doPatch({ is_beta: !data.clinic.is_beta }, 'Estado beta actualizado')
                    }
                    disabled={busy}
                    className={clsx(
                      'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium',
                      data.clinic.is_beta
                        ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'
                        : 'bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]',
                    )}
                  >
                    <Sparkles className="h-3 w-3" />
                    {data.clinic.is_beta ? 'Beta ON' : 'Marcar Beta'}
                  </button>
                </div>

                {data.clinic.plan === 'trial' && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.04] bg-dark-700/50 p-3">
                    <CalendarClock className="h-3.5 w-3.5 text-amber-300" />
                    <span className="text-xs text-zinc-400">
                      Trial vence: {data.clinic.trial_ends_at
                        ? new Date(data.clinic.trial_ends_at).toLocaleDateString()
                        : '—'}
                    </span>
                    <div className="ml-auto flex gap-1">
                      {[7, 14, 30].map((d) => (
                        <button
                          key={d}
                          onClick={() => extendTrial(d)}
                          disabled={busy}
                          className="rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-medium text-amber-300 hover:bg-amber-500/25"
                        >
                          +{d}d
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* WhatsApp */}
            <Section title="WhatsApp">
              <div className="rounded-xl border border-white/[0.04] bg-dark-700/50 p-3">
                <div className="flex items-center gap-2">
                  <Smartphone
                    className={`h-3.5 w-3.5 ${
                      data.clinic.wa_connected ? 'text-lime-400' : 'text-zinc-600'
                    }`}
                  />
                  <span className="text-sm text-zinc-200">
                    {data.clinic.wa_connected
                      ? data.clinic.wa_phone ?? 'conectado'
                      : 'No conectado'}
                  </span>
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-zinc-500">
                    runtime: {data.wa_runtime_status}
                  </span>
                </div>
                {data.clinic.wa_connected && (
                  <button
                    onClick={resetWa}
                    disabled={busy}
                    className="mt-3 inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-300 hover:bg-red-500/20"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Forzar desconexión
                  </button>
                )}
              </div>
            </Section>

            {/* Estado / bloqueo */}
            <Section title="Estado de la cuenta">
              <div className="rounded-xl border border-white/[0.04] bg-dark-700/50 p-3">
                <p className="text-xs text-zinc-400">
                  Estado actual:{' '}
                  <span className="font-semibold text-white">{data.clinic.status}</span>
                </p>
                <div className="mt-3 flex gap-2">
                  {data.clinic.status !== 'suspended' ? (
                    <button
                      onClick={block}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20"
                    >
                      <ShieldOff className="h-3.5 w-3.5" />
                      Suspender
                    </button>
                  ) : (
                    <button
                      onClick={unblock}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg bg-lime-500/10 px-3 py-1.5 text-xs font-medium text-lime-300 hover:bg-lime-500/20"
                    >
                      <Shield className="h-3.5 w-3.5" />
                      Reactivar
                    </button>
                  )}
                </div>
                {data.blocks.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                      Histórico de bloqueos
                    </p>
                    {data.blocks.slice(0, 3).map((b) => (
                      <div
                        key={b.id}
                        className="rounded-md border border-white/[0.04] bg-dark-700/40 px-2 py-1.5"
                      >
                        <p className="text-xs text-zinc-300">{b.reason}</p>
                        <p className="text-[10px] text-zinc-500">
                          {new Date(b.blocked_at).toLocaleString()}
                          {b.unblocked_at && ` · reactivada ${new Date(b.unblocked_at).toLocaleDateString()}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            {/* Logs recientes */}
            {data.recent_logs.length > 0 && (
              <Section title="Acciones recientes sobre esta clínica">
                <div className="space-y-1.5">
                  {data.recent_logs.slice(0, 8).map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center gap-2 rounded-md border border-white/[0.04] bg-dark-700/40 px-2 py-1.5 text-xs"
                    >
                      <AlertTriangle className="h-3 w-3 text-zinc-500" />
                      <span className="text-zinc-300">{l.action}</span>
                      <span className="ml-auto text-[10px] text-zinc-500">
                        {new Date(l.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </p>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-dark-700/50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-white">{value}</p>
    </div>
  )
}
