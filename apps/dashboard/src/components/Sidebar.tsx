import { useState, useRef, useEffect } from 'react'
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
  ChevronUp,
  UserRound,
  KeyRound,
  Crown,
} from 'lucide-react'
import Avatar from './Avatar'
import ProfileModal from './ProfileModal'

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

type Tab = 'profile' | 'account' | 'plan' | 'session'

export default function Sidebar() {
  const { signOut, user } = useAuth()
  const { clinic, config } = useClinic()
  const [menuOpen, setMenuOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTab, setModalTab] = useState<Tab>('profile')
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const fullName = (user?.user_metadata?.['full_name'] as string | undefined) ?? ''
  const displayName = fullName.trim() || clinic?.name || user?.email?.split('@')[0] || 'Usuario'
  const planLabel = clinic?.plan === 'trial' ? 'Trial' : clinic?.plan?.toUpperCase() ?? ''

  const openModal = (tab: Tab) => {
    setModalTab(tab)
    setModalOpen(true)
    setMenuOpen(false)
  }

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-white/[0.06] bg-dark-800">
        {/* Logo */}
        <div className="px-6 py-6">
          <img src="/logo-dark.svg" alt="Celura" className="h-8" />
        </div>

        {/* User card → dispara dropdown */}
        {clinic && (
          <div ref={menuRef} className="relative mx-3 mb-4">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className={clsx(
                'group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all',
                menuOpen
                  ? 'border-white/[0.08] bg-white/[0.05]'
                  : 'bg-white/[0.03] hover:border-white/[0.06] hover:bg-white/[0.05]',
              )}
            >
              <Avatar name={displayName} size="sm" ring />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className={clsx(
                      'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                      clinic.plan === 'pro'
                        ? 'bg-lime-500/15 text-lime-300'
                        : clinic.plan === 'clinica'
                        ? 'bg-violet-500/15 text-violet-300'
                        : clinic.plan === 'esencial'
                        ? 'bg-sky-500/15 text-sky-300'
                        : 'bg-amber-500/15 text-amber-300',
                    )}
                  >
                    {planLabel}
                  </span>
                  {clinic.is_beta && (
                    <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-300">
                      Beta
                    </span>
                  )}
                  {config?.wa_connected ? (
                    <span className="flex items-center gap-1 text-[10px] text-lime-400">
                      <span className="h-1 w-1 animate-pulse rounded-full bg-lime-400" />
                      Activo
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-600">WA off</span>
                  )}
                </div>
                {clinic.trial_ends_at && (clinic.is_beta || clinic.plan === 'trial') && (
                  <p className="mt-1 text-[10px] text-zinc-500">
                    {daysLeftLabel(clinic.trial_ends_at)}
                  </p>
                )}
              </div>
              <ChevronUp
                className={clsx(
                  'h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform',
                  !menuOpen && 'rotate-180',
                )}
              />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-white/[0.08] bg-dark-700 shadow-2xl shadow-black/40 animate-scale-in origin-bottom">
                <div className="border-b border-white/[0.06] px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={displayName} size="md" ring />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                      <p className="truncate text-[11px] text-zinc-500">{user?.email}</p>
                    </div>
                  </div>
                </div>
                <div className="py-1">
                  <MenuItem icon={UserRound} label="Editar perfil"      onClick={() => openModal('profile')} />
                  <MenuItem icon={KeyRound}  label="Correo y contraseña" onClick={() => openModal('account')} />
                  <MenuItem icon={Crown}     label="Mi plan"             onClick={() => openModal('plan')} />
                </div>
                <div className="border-t border-white/[0.06] py-1">
                  <MenuItem
                    icon={LogOut}
                    label="Cerrar sesión"
                    onClick={() => { setMenuOpen(false); signOut() }}
                    danger
                  />
                </div>
              </div>
            )}
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

        {/* Footer — botón mini para abrir perfil */}
        <div className="border-t border-white/[0.06] px-3 py-3">
          <button
            onClick={() => openModal('profile')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[12px] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300"
          >
            <Settings className="h-[15px] w-[15px]" />
            Cuenta y preferencias
          </button>
        </div>
      </aside>

      <ProfileModal open={modalOpen} onClose={() => setModalOpen(false)} initialTab={modalTab} />
    </>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors',
        danger
          ? 'text-red-300 hover:bg-red-500/10'
          : 'text-zinc-300 hover:bg-white/[0.04]',
      )}
    >
      <Icon className="h-[14px] w-[14px]" />
      {label}
    </button>
  )
}
