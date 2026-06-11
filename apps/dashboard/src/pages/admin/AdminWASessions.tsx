import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Smartphone, RefreshCw, WifiOff, Wifi } from 'lucide-react'
import clsx from 'clsx'

type RuntimeStatus = 'connected' | 'connecting' | 'qr' | 'disconnected' | 'unknown' | string

interface WASessionRow {
  clinic_id: string
  wa_phone: string | null
  connected_at: string | null
  runtime_status: RuntimeStatus
}

interface ListRes {
  items: WASessionRow[]
  total: number
}

export default function AdminWASessions() {
  const [items, setItems] = useState<WASessionRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const load = async () => {
    const res = await api.get<ListRes>('/admin/wa-sessions')
    if (res.data) {
      setItems(res.data.items)
      setTotal(res.data.total)
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await load()
      setLoading(false)
    })()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const resetSession = async (clinicId: string) => {
    if (!confirm('¿Forzar desconexión de WhatsApp de esta clínica? Tendrán que escanear QR de nuevo.')) return
    await api.post(`/admin/clinics/${clinicId}/reset-wa`, {})
    setFlash('Sesión cerrada')
    setTimeout(() => setFlash(null), 2400)
    await load()
  }

  // Cruzar runtime vs DB para detectar inconsistencias
  const disconnected = items.filter((i) => i.runtime_status !== 'connected')
  const healthy = items.filter((i) => i.runtime_status === 'connected')

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">Sesiones WhatsApp</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {total.toLocaleString()} clínicas marcadas como conectadas. {healthy.length} activas en runtime,{' '}
            {disconnected.length > 0 ? (
              <span className="text-amber-400">{disconnected.length} desincronizadas</span>
            ) : (
              <span className="text-lime-400">todo en sintonía</span>
            )}
            .
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="touch-target flex items-center justify-center gap-2 rounded-lg border border-white/[0.06] bg-dark-700 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.04] disabled:opacity-50"
        >
          <RefreshCw className={clsx('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Actualizar
        </button>
      </div>

      {flash && (
        <div className="rounded-lg border border-lime-500/20 bg-lime-500/10 px-3 py-2 text-xs text-lime-300">
          {flash}
        </div>
      )}

      {/* Vista móvil */}
      <div className="space-y-2 lg:hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
          ))
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-dark-800 p-12 text-center text-sm text-zinc-500">
            <Smartphone className="mx-auto h-6 w-6 text-zinc-600" />
            <p className="mt-2">Ninguna clínica con WhatsApp conectado.</p>
          </div>
        ) : (
          items.map((s) => (
            <div key={s.clinic_id} className="rounded-xl border border-white/[0.06] bg-dark-800 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-200">
                    {s.wa_phone ?? <span className="text-zinc-600">sin teléfono</span>}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-zinc-500">{s.clinic_id.slice(0, 12)}…</p>
                </div>
                <RuntimeBadge status={s.runtime_status} />
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                {s.connected_at ? `Desde ${new Date(s.connected_at).toLocaleString('es')}` : 'Sin fecha'}
              </p>
              <button
                onClick={() => resetSession(s.clinic_id)}
                className="touch-target mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-2 text-xs text-red-300 hover:bg-red-500/20"
              >
                <WifiOff className="h-3.5 w-3.5" />
                Forzar logout
              </button>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-white/[0.06] bg-dark-800 lg:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/[0.06] bg-white/[0.02]">
            <tr className="text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 font-medium">Clínica</th>
              <th className="px-4 py-3 font-medium">Teléfono</th>
              <th className="px-4 py-3 font-medium">Conectado desde</th>
              <th className="px-4 py-3 font-medium">Runtime</th>
              <th className="px-4 py-3 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-white/[0.04]">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-6 animate-pulse rounded bg-white/[0.03]" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-zinc-500">
                  <Smartphone className="mx-auto h-6 w-6 text-zinc-600" />
                  <p className="mt-2">Ninguna clínica con WhatsApp conectado.</p>
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr
                  key={s.clinic_id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3 font-mono text-[11px] text-zinc-400">
                    {s.clinic_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3">
                    {s.wa_phone ? (
                      <span className="font-medium text-zinc-200">{s.wa_phone}</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {s.connected_at ? new Date(s.connected_at).toLocaleString('es') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <RuntimeBadge status={s.runtime_status} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => resetSession(s.clinic_id)}
                      className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/20"
                    >
                      <WifiOff className="h-3 w-3" />
                      Forzar logout
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-zinc-600">
        La tabla se refresca automáticamente cada 15 segundos. El estado <em>runtime</em> proviene
        del proceso API y puede diferir de la DB si se reinició el servidor.
      </p>
    </div>
  )
}

function RuntimeBadge({ status }: { status: RuntimeStatus }) {
  const styles: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    connected: {
      cls: 'bg-lime-500/15 text-lime-300',
      icon: <Wifi className="h-3 w-3" />,
      label: 'Conectado',
    },
    connecting: {
      cls: 'bg-amber-500/15 text-amber-300',
      icon: <RefreshCw className="h-3 w-3 animate-spin" />,
      label: 'Conectando',
    },
    qr: {
      cls: 'bg-sky-500/15 text-sky-300',
      icon: <Smartphone className="h-3 w-3" />,
      label: 'Esperando QR',
    },
    disconnected: {
      cls: 'bg-red-500/15 text-red-300',
      icon: <WifiOff className="h-3 w-3" />,
      label: 'Desconectado',
    },
  }
  const m = styles[status] ?? {
    cls: 'bg-zinc-500/15 text-zinc-400',
    icon: <WifiOff className="h-3 w-3" />,
    label: status,
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        m.cls,
      )}
    >
      {m.icon}
      {m.label}
    </span>
  )
}
