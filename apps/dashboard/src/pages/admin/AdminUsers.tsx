import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Search, ShieldCheck, Mail, UserCircle2 } from 'lucide-react'
import clsx from 'clsx'

interface AdminUserRow {
  id: string
  email: string | null
  full_name: string | null
  created_at: string
  last_sign_in_at: string | null
  confirmed: boolean
  clinic: {
    id: string
    name: string
    plan: string
    status: string
  } | null
  admin_role: 'admin' | 'superadmin' | null
}

interface ListRes {
  users: AdminUserRow[]
  total: number
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    setLoading(true)
    api.get<ListRes>('/admin/users?perPage=200').then((r) => {
      if (r.data) {
        setUsers(r.data.users)
        setTotal(r.data.total)
      }
      setLoading(false)
    })
  }, [])

  const filtered = q
    ? users.filter((u) => {
        const needle = q.toLowerCase()
        return (
          u.email?.toLowerCase().includes(needle) ||
          u.full_name?.toLowerCase().includes(needle) ||
          u.clinic?.name.toLowerCase().includes(needle)
        )
      })
    : users

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white sm:text-2xl">Usuarios</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {total.toLocaleString()} cuentas en auth. Filtra por correo, nombre o clínica.
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-dark-800 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por correo, nombre o clínica…"
            className="h-10 w-full rounded-lg border border-white/[0.06] bg-dark-700 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-violet-400/30 focus:outline-none sm:h-9"
          />
        </div>
      </div>

      {/* Vista móvil */}
      <div className="space-y-2 lg:hidden">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-dark-800 p-12 text-center text-sm text-zinc-500">
            <UserCircle2 className="mx-auto h-6 w-6 text-zinc-600" />
            <p className="mt-2">Sin usuarios.</p>
          </div>
        ) : (
          filtered.map((u) => (
            <div key={u.id} className="rounded-xl border border-white/[0.06] bg-dark-800 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{u.full_name ?? '—'}</p>
                  <p className="truncate text-[11px] text-zinc-500">{u.email ?? '—'}</p>
                  {u.clinic && (
                    <p className="mt-1 truncate text-[11px] text-zinc-400">
                      {u.clinic.name}{' '}
                      <span className="text-zinc-600">· {u.clinic.plan} · {u.clinic.status}</span>
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {u.admin_role && (
                      <span className="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        {u.admin_role}
                      </span>
                    )}
                    <span
                      className={clsx(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                        u.confirmed
                          ? 'bg-lime-500/15 text-lime-300'
                          : 'bg-amber-500/15 text-amber-300',
                      )}
                    >
                      {u.confirmed ? 'Confirmado' : 'Pendiente'}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] text-zinc-500">
                    Creado {new Date(u.created_at).toLocaleDateString('es')}
                    {u.last_sign_in_at && (
                      <> · Último acceso {new Date(u.last_sign_in_at).toLocaleDateString('es')}</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-white/[0.06] bg-dark-800 lg:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/[0.06] bg-white/[0.02]">
            <tr className="text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Clínica</th>
              <th className="px-4 py-3 font-medium">Rol admin</th>
              <th className="px-4 py-3 font-medium">Confirmado</th>
              <th className="px-4 py-3 font-medium">Último acceso</th>
              <th className="px-4 py-3 font-medium">Creado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-white/[0.04]">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-6 animate-pulse rounded bg-white/[0.03]" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-500">
                  <UserCircle2 className="mx-auto h-6 w-6 text-zinc-600" />
                  <p className="mt-2">Sin usuarios.</p>
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
                        <Mail className="h-3 w-3" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{u.full_name ?? '—'}</p>
                        <p className="text-[11px] text-zinc-500">{u.email ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.clinic ? (
                      <div>
                        <p className="text-zinc-200">{u.clinic.name}</p>
                        <p className="text-[11px] text-zinc-500">
                          {u.clinic.plan} · {u.clinic.status}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-600">sin clínica</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.admin_role ? (
                      <span className="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        {u.admin_role}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                        u.confirmed
                          ? 'bg-lime-500/15 text-lime-300'
                          : 'bg-amber-500/15 text-amber-300',
                      )}
                    >
                      {u.confirmed ? 'Sí' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('es') : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {new Date(u.created_at).toLocaleDateString('es')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
