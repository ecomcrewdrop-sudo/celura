import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import {
  AlertTriangle,
  AlertCircle,
  Flame,
  CheckCircle2,
  RotateCw,
  Trash2,
  Bug,
  Activity,
  RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'

type Severity = 'warning' | 'error' | 'critical'

interface ErrorEvent {
  id: string
  fingerprint: string
  source: string
  severity: Severity
  code: string | null
  title: string
  detail: string | null
  stack: string | null
  clinic_id: string | null
  context: Record<string, unknown> | null
  occurrences: number
  first_seen_at: string
  last_seen_at: string
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
}

interface ListRes {
  items: ErrorEvent[]
  total: number
}

interface Stats {
  unresolved: number
  critical_24h: number
  last_1h: number
  by_source: Record<string, number>
}

export default function AdminErrors() {
  const [items, setItems] = useState<ErrorEvent[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState('')
  const [severity, setSeverity] = useState('')
  const [resolved, setResolved] = useState('false') // por defecto, sólo no resueltos
  const [expanded, setExpanded] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: '200' })
    if (source) params.set('source', source)
    if (severity) params.set('severity', severity)
    if (resolved) params.set('resolved', resolved)
    const [list, statsRes] = await Promise.all([
      api.get<ListRes>(`/admin/errors?${params.toString()}`),
      api.get<Stats>('/admin/errors/stats'),
    ])
    if (list.data) {
      setItems(list.data.items)
      setTotal(list.data.total)
    }
    if (statsRes.data) setStats(statsRes.data)
  }, [source, severity, resolved])

  useEffect(() => {
    setLoading(true)
    void load().then(() => setLoading(false))
  }, [load])

  // Auto-refresh cada 10s si está activado
  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => void load(), 10_000)
    return () => clearInterval(t)
  }, [autoRefresh, load])

  const showFlash = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 2400)
  }

  const resolve = async (id: string) => {
    await api.post(`/admin/errors/${id}/resolve`, {})
    showFlash('Marcado como resuelto')
    await load()
  }

  const reopen = async (id: string) => {
    await api.post(`/admin/errors/${id}/reopen`, {})
    showFlash('Reabierto')
    await load()
  }

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este registro de error? No se puede deshacer.')) return
    await api.delete(`/admin/errors/${id}`)
    showFlash('Eliminado')
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">Feed de errores</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {total.toLocaleString()} eventos agrupados por huella. Tap para ver el stack.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-3.5 w-3.5 accent-violet-500"
          />
          Auto-refresh 10s
          {autoRefresh && <RefreshCw className="h-3 w-3 animate-spin text-violet-400" />}
        </label>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={AlertCircle}
            label="Sin resolver"
            value={stats.unresolved}
            color={stats.unresolved > 0 ? 'red' : 'lime'}
          />
          <StatCard
            icon={Flame}
            label="Críticos 24h"
            value={stats.critical_24h}
            color={stats.critical_24h > 0 ? 'red' : 'zinc'}
          />
          <StatCard
            icon={Activity}
            label="Última hora"
            value={stats.last_1h}
            color={stats.last_1h > 5 ? 'amber' : 'zinc'}
          />
          <div className="rounded-2xl border border-white/[0.06] bg-dark-800 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Por fuente (24h)</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.keys(stats.by_source).length === 0 ? (
                <span className="text-xs text-zinc-600">sin errores</span>
              ) : (
                Object.entries(stats.by_source).map(([s, n]) => (
                  <span
                    key={s}
                    className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono text-zinc-300"
                  >
                    {s}:{n}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {flash && (
        <div className="rounded-lg border border-lime-500/20 bg-lime-500/10 px-3 py-2 text-xs text-lime-300">
          {flash}
        </div>
      )}

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-2 rounded-xl border border-white/[0.06] bg-dark-800 p-3 sm:flex sm:flex-wrap sm:items-center">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-9 rounded-lg border border-white/[0.06] bg-dark-700 px-3 text-xs text-zinc-300 focus:border-violet-400/30 focus:outline-none"
        >
          <option value="">Todas las fuentes</option>
          <option value="whisper">Whisper</option>
          <option value="claude">Claude</option>
          <option value="openai">OpenAI</option>
          <option value="baileys">Baileys (WA)</option>
          <option value="fastify">Fastify</option>
          <option value="webhook">Webhook</option>
          <option value="supabase">Supabase</option>
          <option value="system">Sistema</option>
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="h-9 rounded-lg border border-white/[0.06] bg-dark-700 px-3 text-xs text-zinc-300 focus:border-violet-400/30 focus:outline-none"
        >
          <option value="">Cualquier severidad</option>
          <option value="critical">Crítico</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>
        <select
          value={resolved}
          onChange={(e) => setResolved(e.target.value)}
          className="h-9 rounded-lg border border-white/[0.06] bg-dark-700 px-3 text-xs text-zinc-300 focus:border-violet-400/30 focus:outline-none"
        >
          <option value="">Resueltos y abiertos</option>
          <option value="false">Solo abiertos</option>
          <option value="true">Solo resueltos</option>
        </select>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />
          ))
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-dark-800 p-12 text-center text-sm text-zinc-500">
            <CheckCircle2 className="mx-auto h-8 w-8 text-lime-500/60" />
            <p className="mt-2 text-zinc-400">Sin errores que mostrar. Todo en orden.</p>
          </div>
        ) : (
          items.map((e) => (
            <div
              key={e.id}
              className={clsx(
                'rounded-xl border bg-dark-800',
                e.resolved_at
                  ? 'border-white/[0.04] opacity-60'
                  : e.severity === 'critical'
                  ? 'border-red-500/30'
                  : e.severity === 'error'
                  ? 'border-amber-500/20'
                  : 'border-white/[0.06]',
              )}
            >
              <div
                onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                className="flex cursor-pointer items-start gap-3 p-4 hover:bg-white/[0.02]"
              >
                <SeverityIcon severity={e.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-400">
                      {e.source}
                    </span>
                    {e.code && (
                      <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                        {e.code}
                      </span>
                    )}
                    <span
                      className={clsx(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                        e.severity === 'critical'
                          ? 'bg-red-500/15 text-red-300'
                          : e.severity === 'error'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-sky-500/15 text-sky-300',
                      )}
                    >
                      {e.severity}
                    </span>
                    {e.occurrences > 1 && (
                      <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">
                        ×{e.occurrences}
                      </span>
                    )}
                    {e.resolved_at && (
                      <span className="inline-flex items-center gap-1 rounded bg-lime-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-lime-300">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        resuelto
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-sm font-medium text-white">{e.title}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Último visto {formatRelative(e.last_seen_at)} · primero {formatRelative(e.first_seen_at)}
                    {e.clinic_id && (
                      <>
                        {' · clinic '}
                        <span className="font-mono">{e.clinic_id.slice(0, 8)}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1" onClick={(ev) => ev.stopPropagation()}>
                  {e.resolved_at ? (
                    <button
                      onClick={() => reopen(e.id)}
                      className="rounded-lg border border-white/[0.06] bg-dark-700 p-2 text-zinc-400 hover:bg-white/[0.04]"
                      title="Reabrir"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => resolve(e.id)}
                      className="rounded-lg border border-lime-500/20 bg-lime-500/10 p-2 text-lime-300 hover:bg-lime-500/20"
                      title="Marcar resuelto"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => remove(e.id)}
                    className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {expanded === e.id && (
                <div className="border-t border-white/[0.04] p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {e.detail && (
                      <DetailBlock label="Mensaje completo">
                        <pre className="whitespace-pre-wrap break-words rounded bg-dark-900 p-3 text-[11px] text-zinc-300">
                          {e.detail}
                        </pre>
                      </DetailBlock>
                    )}
                    {e.context && Object.keys(e.context).length > 0 && (
                      <DetailBlock label="Contexto">
                        <pre className="overflow-x-auto rounded bg-dark-900 p-3 text-[11px] text-zinc-300">
                          {JSON.stringify(e.context, null, 2)}
                        </pre>
                      </DetailBlock>
                    )}
                    {e.stack && (
                      <div className="lg:col-span-2">
                        <DetailBlock label="Stack trace">
                          <pre className="overflow-x-auto rounded bg-dark-900 p-3 text-[10px] leading-relaxed text-zinc-400">
                            {e.stack}
                          </pre>
                        </DetailBlock>
                      </div>
                    )}
                    <div className="lg:col-span-2 text-[10px] text-zinc-600">
                      <span className="font-mono">fingerprint: {e.fingerprint}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  color: 'red' | 'amber' | 'lime' | 'zinc'
}) {
  const map = {
    red: 'bg-red-500/10 text-red-400',
    amber: 'bg-amber-500/10 text-amber-400',
    lime: 'bg-lime-500/10 text-lime-400',
    zinc: 'bg-white/[0.04] text-zinc-400',
  }
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-dark-800 p-4">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${map[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  )
}

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === 'critical') return <Flame className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
  if (severity === 'error') return <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
  return <Bug className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      {children}
    </div>
  )
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'hace segundos'
  if (min < 60) return `hace ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d}d`
  return new Date(iso).toLocaleDateString('es')
}
