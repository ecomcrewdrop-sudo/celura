import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useClinic } from '@/hooks/useClinic'
import clsx from 'clsx'
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  MessageSquare,
  Settings,
  Smartphone,
  LogOut,
  Stethoscope,
} from 'lucide-react'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/appointments', label: 'Citas', icon: CalendarDays },
  { to: '/conversations', label: 'Conversaciones', icon: MessageSquare },
  { to: '/whatsapp', label: 'WhatsApp', icon: Smartphone },
  { to: '/settings', label: 'Configuración', icon: Settings },
]

export default function Sidebar() {
  const { signOut } = useAuth()
  const { clinic, config } = useClinic()

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-dark-700 bg-dark-800">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-dark-700 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime-500/20">
          <Stethoscope className="h-5 w-5 text-lime-400" />
        </div>
        <div>
          <span className="text-lg font-bold tracking-tight text-white">Celura</span>
          <span className="ml-1 text-xs text-lime-400/80">beta</span>
        </div>
      </div>

      {/* Clínica */}
      {clinic && (
        <div className="border-b border-dark-700 px-6 py-3">
          <p className="truncate text-sm font-medium text-white">{clinic.name}</p>
          <p className="text-xs text-zinc-500">
            {clinic.plan === 'trial' ? 'Trial' : clinic.plan} ·{' '}
            {config?.wa_connected ? (
              <span className="text-lime-400">WhatsApp activo</span>
            ) : (
              <span className="text-zinc-500">WA desconectado</span>
            )}
          </p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-lime-500/15 text-lime-400'
                  : 'text-zinc-400 hover:bg-dark-600 hover:text-white',
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-dark-700 px-3 py-3">
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-500 transition-colors hover:bg-dark-600 hover:text-white"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
