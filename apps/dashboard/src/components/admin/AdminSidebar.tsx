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
  Ticket,
  AlertTriangle,
  LineChart,
  X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAdmin } from '@/hooks/useAdmin'

const links = [
  { to: '/admin', label: 'Overview', icon: Gauge, end: true },
  { to: '/admin/clinics', label: 'Clínicas', icon: Building2 },
  { to: '/admin/users', label: 'Usuarios', icon: Users },
  { to: '/admin/announcements', label: 'Anuncios', icon: Megaphone },
  { to: '/admin/promos', label: 'Códigos promo', icon: Ticket },
  { to: '/admin/cohorts', label: 'Cohortes', icon: LineChart },
  { to: '/admin/errors', label: 'Errores', icon: AlertTriangle },
  { to: '/admin/wa-sessions', label: 'WhatsApp', icon: Smartphone },
  { to: '/admin/logs', label: 'Auditoría', icon: ScrollText },
]

interface AdminSidebarProps {
  open?: boolean
  onClose?: () => void
}

export default function AdminSidebar({ open = false, onClose }: AdminSidebarProps) {
  const { user, signOut } = useAuth()
  const { identity } = useAdmin()

  return (
    <aside
      className={clsx(
        'safe-pl fixed left-0 top-0 z-40 flex h-dscreen w-[82vw] max-w-[320px] flex-col border-r border-white/[0.06] bg-dark-800 transition-transform duration-300 ease-out',
        'lg:w-64 lg:max-w-none lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      {/* Header */}
      <div className="safe-pt border-b border-white/[0.06] px-5 py-5">
        <div className="flex items-center justify-between">
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
          <button
            onClick={onClose}
            className="touch-target -mr-2 flex items-center justify-center rounded-xl px-2 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 truncate text-[11px] text-zinc-500">{user?.email}</p>
      </div>

      {/* Volver al dashboard normal */}
      <NavLink
        to="/"
        className="mx-3 mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 lg:py-2 lg:text-[12px]"
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
                'group relative flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-medium transition-all duration-200 lg:py-2.5 lg:text-[13px]',
                isActive
                  ? 'bg-violet-500/[0.10] text-violet-300'
                  : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-violet-400" />
                )}
                <Icon className="h-[20px] w-[20px] lg:h-[18px] lg:w-[18px]" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="safe-pb border-t border-white/[0.06] px-3 py-3">
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 lg:py-2 lg:text-[12px]"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
