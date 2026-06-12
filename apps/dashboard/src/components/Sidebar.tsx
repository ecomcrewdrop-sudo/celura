import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useClinic } from '@/hooks/useClinic'
import { useAdmin } from '@/hooks/useAdmin'
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
  UserRound,
  KeyRound,
  Crown,
  ShieldCheck,
  X,
} from 'lucide-react'
import Avatar from './Avatar'
import ProfileModal from './ProfileModal'
import NotificationsBell from './NotificationsBell'
import { trialLabel as daysLeftLabel } from '@/lib/trial'
import { useSetupSteps } from '@/hooks/useSetupSteps'
import { Sparkles } from 'lucide-react'

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

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const { signOut, user } = useAuth()
  const { clinic, config } = useClinic()
  const { isAdmin } = useAdmin()
  const { pendingRequiredCount, isComplete: setupComplete } = useSetupSteps()
  const [menuOpen, setMenuOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTab, setModalTab] = useState<Tab>('profile')
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close user dropdown on outside click
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
      <aside
        className={clsx(
          'safe-pl fixed left-0 top-0 z-40 flex h-dscreen w-[82vw] max-w-[320px] flex-col border-r border-white/[0.06] bg-dark-800 transition-transform duration-300 ease-out',
          'lg:w-64 lg:max-w-none lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Header row: logo + close (mobile only) */}
        <div className="safe-pt flex items-center justify-between px-5 py-5">
          <img src="/logo-dark.svg" alt="Celura" className="h-8" />
          <div className="flex items-center gap-1">
            <div className="hidden lg:block">
              <NotificationsBell />
            </div>
            <button
              onClick={onClose}
              className="touch-target -mr-2 flex items-center justify-center rounded-xl px-2 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 lg:hidden"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
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
              <ChevronRight
                className={clsx(
                  'h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform',
                  menuOpen && 'rotate-90 lg:rotate-180',
                )}
              />
            </button>

            {/* Dropdown — desktop: sale a la derecha del sidebar; mobile: cae debajo */}
            {menuOpen && (
              <div
                className={clsx(
                  'animate-scale-in z-50 overflow-hidden rounded-xl border border-white/[0.08] bg-dark-700 shadow-2xl shadow-black/60 ring-1 ring-black/20',
                  // Desktop position
                  'lg:absolute lg:left-full lg:top-0 lg:ml-3 lg:w-72 lg:origin-left',
                  // Mobile: in-flow below the button
                  'mt-2 w-full lg:mt-0',
                )}
              >
                {/* Pico — solo desktop */}
                <div className="absolute -left-1.5 top-5 hidden h-3 w-3 rotate-45 border-b border-l border-white/[0.08] bg-dark-700 lg:block" />

                <div className="relative border-b border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-transparent px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={displayName} size="lg" ring />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                      <p className="truncate text-[11px] text-zinc-500">{user?.email}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
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
                      </div>
                    </div>
                  </div>
                  {clinic.trial_ends_at && (clinic.is_beta || clinic.plan === 'trial') && (
                    <p className="mt-3 text-[10px] text-zinc-500">
                      {daysLeftLabel(clinic.trial_ends_at)}
                    </p>
                  )}
                </div>
                <div className="py-1.5">
                  <MenuItem icon={UserRound} label="Editar perfil"        onClick={() => openModal('profile')} />
                  <MenuItem icon={KeyRound}  label="Correo y contraseña"  onClick={() => openModal('account')} />
                  <MenuItem icon={Crown}     label="Mi plan"              onClick={() => openModal('plan')} />
                </div>
                <div className="border-t border-white/[0.06] py-1.5">
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
          {!setupComplete && (
            <NavLink
              to="/setup"
              className={({ isActive }) =>
                clsx(
                  'group relative mb-1 flex items-center gap-3 rounded-xl border px-3 py-3 text-[14px] font-medium transition-all duration-200 lg:py-2.5 lg:text-[13px]',
                  isActive
                    ? 'border-lime-400/30 bg-lime-400/[0.08] text-lime-300'
                    : 'border-lime-400/15 bg-lime-400/[0.04] text-lime-200 hover:border-lime-400/25 hover:bg-lime-400/[0.07]',
                )
              }
            >
              <Sparkles className="h-[18px] w-[18px] shrink-0 text-lime-300" />
              <span className="flex-1">Guía de configuración</span>
              {pendingRequiredCount > 0 && (
                <span className="rounded-full bg-lime-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-dark-900">
                  {pendingRequiredCount}
                </span>
              )}
            </NavLink>
          )}
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-medium transition-all duration-200 lg:py-2.5 lg:text-[13px]',
                  isActive
                    ? 'bg-lime-500/[0.08] text-lime-400'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-lime-400" />
                  )}
                  <Icon className="h-[20px] w-[20px] lg:h-[18px] lg:w-[18px]" />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="safe-pb space-y-1 border-t border-white/[0.06] px-3 py-3">
          {isAdmin && (
            <NavLink
              to="/admin"
              className="flex w-full items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2.5 text-[13px] font-medium text-violet-300 transition-colors hover:bg-violet-500/20 lg:py-2 lg:text-[12px]"
            >
              <ShieldCheck className="h-[16px] w-[16px] lg:h-[15px] lg:w-[15px]" />
              Panel admin
            </NavLink>
          )}
          <button
            onClick={() => openModal('profile')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 lg:py-2 lg:text-[12px]"
          >
            <Settings className="h-[16px] w-[16px] lg:h-[15px] lg:w-[15px]" />
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
        'flex w-full items-center gap-2.5 px-3 py-2.5 text-[14px] font-medium transition-colors lg:py-2 lg:text-[13px]',
        danger
          ? 'text-red-300 hover:bg-red-500/10'
          : 'text-zinc-300 hover:bg-white/[0.04]',
      )}
    >
      <Icon className="h-[15px] w-[15px] lg:h-[14px] lg:w-[14px]" />
      {label}
    </button>
  )
}
