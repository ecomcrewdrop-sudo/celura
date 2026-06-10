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
  Workflow,
  LogOut,
  ChevronRight,
} from 'lucide-react'

function daysLeftLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (Number.isNaN(ms)) return ''
  const d = Math.ceil(ms / 86_400_000)
  if (d <= 0) return 'Tu acceso ha terminado'
  if (d === 1) return 'Termina mañana'
  return `${d} días restantes`
}

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/appointments', label: 'Citas', icon: CalendarDays },
  { to: '/conversations', label: 'Conversaciones', icon: MessageSquare },
  { to: '/workflows', label: 'Flujos', icon: Workflow },
  { to: '/whatsapp', label: 'WhatsApp', icon: Smartphone },
  { to: '/settings', label: 'Configuración', icon: Settings },
]

export default function Sidebar() {
  const { signOut } = useAuth()
  const { clinic, config } = useClinic()

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-white/[0.06] bg-dark-800">
      {/* Logo */}
      <div className="px-6 py-6">
        <img src="/logo-dark.svg" alt="Celura" className="h-8" />
      </div>

      {/* Clínica */}
      {clinic && (
        <div className="mx-4 mb-4 rounded-xl bg-white/[0.03] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{clinic.name}</p>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={clsx(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
                    clinic.plan === 'pro'
                      ? 'bg-lime-500/15 text-lime-300'
                      : 'bg-white/[0.06] text-zinc-400',
                  )}
                >
                  {clinic.plan === 'trial' ? 'Trial' : clinic.plan}
                </span>
                {clinic.is_beta && (
                  <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                    Beta
                  </span>
                )}
                {config?.wa_connected ? (
                  <span className="flex items-center gap-1 text-[11px] text-lime-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-lime-400" />
                    Activo
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-600">WA off</span>
                )}
              </div>
              {clinic.trial_ends_at && (clinic.is_beta || clinic.plan === 'trial') && (
                <p className="mt-1.5 text-[10px] text-zinc-500">
                  {daysLeftLabel(clinic.trial_ends_at)}
                </p>
              )}
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
                isActive
                  ? 'bg-lime-500/[0.08] text-lime-400'
                  : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-lime-400" />
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
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-zinc-600 transition-colors hover:bg-white/[0.04] hover:text-zinc-400"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
