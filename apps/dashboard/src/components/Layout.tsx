import { useState, useEffect } from 'react'
import { Outlet, useLocation, NavLink } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import { useClinic } from '@/hooks/useClinic'
import Avatar from './Avatar'
import NotificationsBell from './NotificationsBell'
import NotificationsDrawer from './NotificationsDrawer'
import NotificationsToastStack from './NotificationsToastStack'
import WelcomeModal from './WelcomeModal'

export default function Layout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { clinic } = useClinic()

  // Close drawer on navigation
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Lock body scroll while drawer is open (mobile)
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  const displayName = clinic?.name || 'Celura'

  return (
    <div className="min-h-dscreen bg-dark-900">
      {/* Sidebar — drawer on mobile, fixed on lg+ */}
      <Sidebar open={open} onClose={() => setOpen(false)} />

      {/* Backdrop for mobile drawer */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="animate-backdrop-in fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          aria-hidden
        />
      )}

      <main className="min-h-dscreen lg:ml-64">
        {/* Mobile top bar */}
        <header className="safe-pt sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.06] bg-dark-900/80 px-4 py-3 backdrop-blur-md lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="touch-target -ml-2 flex items-center justify-center rounded-xl px-2 text-zinc-300 transition-colors hover:bg-white/[0.04] active:bg-white/[0.08]"
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo-dark.svg" alt="Celura" className="h-6" />
          </div>
          <div className="-mr-2 flex items-center gap-1">
            <NotificationsBell />
            <NavLink
              to="/settings"
              className="touch-target flex items-center justify-center rounded-xl px-2 text-zinc-400"
              aria-label="Cuenta"
            >
              <Avatar name={displayName} size="sm" />
            </NavLink>
          </div>
        </header>

        <div className="safe-px mx-auto max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6 lg:max-w-[1600px] lg:px-8 lg:py-8">
          <Outlet />
        </div>

        {/* Bottom safe-area filler for iPhone home indicator */}
        <div className="safe-pb" />
      </main>

      {/* Drawer global de notificaciones (renderizado vía portal) */}
      <NotificationsDrawer />

      {/* Toasts globales de notifs realtime */}
      <NotificationsToastStack />

      {/* Modal de bienvenida (primer login) */}
      <WelcomeModal />
    </div>
  )
}
