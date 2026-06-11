import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { ScrollText, Filter } from 'lucide-react'
import clsx from 'clsx'

interface LogEntry {
  id: string
  admin_user_id: string | null
  admin_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  payload: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
  created_at: string
}

interface ListRes {
  items: LogEntry[]
  total: number
}

export default function AdminLogs() {
  const [items, setItems] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [targetType, setTargetType] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '200' })
    if (action) params.set('action', action)
    if (targetType) params.set('target_type', targetType)
    api.get<ListRes>(`/admin/logs?${params.toString()}`).then((r) => {
      if (r.data) {
        setItems(r.data.items)
        setTotal(r.data.total)
      }
      setLoading(false)
    })
  }, [action, targetType])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Auditoría</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {total.toLocaleString()} eventos registrados. Click en cualquier fila para ver el payload.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-dark-800 p-3">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="h-9 rounded-lg border border-white/[0.06] bg-dark-700 px-3 text-xs text-zinc-300 focus:border-violet-400/30 focus:outline-none"
        >
          <option value="">Todas las acciones</option>
          <option value="clinic.patch">clinic.patch</option>
          <option value="clinic.block">clinic.block</option>
          <option value="clinic.unblock">clinic.unblock</option>
          <option value="clinic.extend_trial">clinic.extend_trial</option>
          <option value="clinic.reset_wa">clinic.reset_wa</option>
          <option value="announcement.create">announcement.create</option>
          <option value="announcement.patch">announcement.patch</option>
          <option value="announcement.delete">announcement.delete</option>
        </select>
        <select
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          className="h-9 rounded-lg border border-white/[0.06] bg-dark-700 px-3 text-xs text-zinc-300 focus:border-violet-400/30 focus:outline-none"
        >
          <option value="">Cualquier target</option>
          <option value="clinic">clinic</option>
          <option value="announcement">announcement</option>
          <option value="user">user</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-dark-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/[0.06] bg-white/[0.02]">
            <tr className="text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 font-medium">Cuándo</th>
              <th className="px-4 py-3 font-medium">Admin</th>
              <th className="px-4 py-3 font-medium">Acción</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-white/[0.04]">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-6 animate-pulse rounded bg-white/[0.03]" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-zinc-500">
                  <Filter className="mx-auto h-6 w-6 text-zinc-600" />
                  <p className="mt-2">Sin eventos para esos filtros.</p>
                </td>
              </tr>
            ) : (
              items.map((l) => (
                <>
                  <tr
                    key={l.id}
                    onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                    className="cursor-pointer border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-400">
                      {formatRelative(l.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-300">
                      {l.admin_email ?? l.admin_user_id?.slice(0, 8) ?? 'sistema'}
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={l.action} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-zinc-500">
                      {l.target_type ? (
                        <>
                          {l.target_type}
                          {l.target_id ? ` · ${l.target_id.slice(0, 8)}…` : ''}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-zinc-600">
                      {l.ip ?? '—'}
                    </td>
                  </tr>
                  {expanded === l.id && (
                    <tr key={`${l.id}-detail`} className="border-b border-white/[0.04] bg-white/[0.01]">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="grid gap-2 lg:grid-cols-2">
                          <DetailBlock label="Payload">
                            <pre className="overflow-x-auto rounded bg-dark-900 p-3 text-[11px] text-zinc-300">
                              {JSON.stringify(l.payload ?? {}, null, 2)}
                            </pre>
                          </DetailBlock>
                          <DetailBlock label="Metadata">
                            <div className="space-y-1 text-[11px] text-zinc-400">
                              <p><span className="text-zinc-500">Fecha exacta:</span> {new Date(l.created_at).toLocaleString('es')}</p>
                              <p><span className="text-zinc-500">Admin ID:</span> <span className="font-mono">{l.admin_user_id ?? '—'}</span></p>
                              <p><span className="text-zinc-500">Target ID:</span> <span className="font-mono">{l.target_id ?? '—'}</span></p>
                              <p className="break-all"><span className="text-zinc-500">User agent:</span> {l.user_agent ?? '—'}</p>
                            </div>
                          </DetailBlock>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <ScrollText className="h-3 w-3" /> {label}
      </p>
      {children}
    </div>
  )
}

function ActionBadge({ action }: { action: string }) {
  const isDestructive = action.includes('block') || action.includes('delete') || action.includes('reset')
  const isCreate = action.includes('create') || action.includes('extend')
  return (
    <span
      className={clsx(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono',
        isDestructive
          ? 'bg-red-500/15 text-red-300'
          : isCreate
          ? 'bg-lime-500/15 text-lime-300'
          : 'bg-violet-500/15 text-violet-300',
      )}
    >
      {action}
    </span>
  )
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(iso).toLocaleDateString('es')
}
