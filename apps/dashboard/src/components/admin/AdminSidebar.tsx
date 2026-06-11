import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import {
  Gauge,
  Building2,
  Users,
  Megaphone,
  ScrollText,
  Smartphone,
  ChevronLeft,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAdmin } from '@/hooks/useAdmin'

const links = [
  { to: '/admin', label: 'Overview', icon: Gauge, end: true },
  { to: '/admin/clinics', label: 'Clínicas', icon: Building2 },
  { to: '/admin/users', label: 'Usuarios', icon: Users },
  { to: '/admin/announcements', label: 'Anuncios', icon: Megaphone },
  { to: '/admin/wa-sessions', label: 'WhatsApp', icon: Smartphone },
  { to: '/admin/logs', label: 'Auditoría', icon: ScrollText },
]

export default function AdminSidebar() {
  const { user, signOut } = useAuth()
  const { identity } = useAdmin()

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-white/[0.06] bg-dark-800">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Celura Admin</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              {identity?.role === 'superadmin' ? 'Super Admin' : 'Admin'}
            </p>
          </div>
        </div>
        <p className="mt-3 truncate text-[11px] text-zinc-500">{user?.email}</p>
      </div>

      {/* Volver al dashboard normal */}
      <NavLink
        to="/"
        className="mx-3 mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Volver al panel de la clínica
      </NavLink>

      {/* Nav */}
      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
                isActive
                  ? 'bg-violet-500/[0.10] text-violet-300'
                  : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-violet-400" />
                )}
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.06] px-3 py-3">
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[12px] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
