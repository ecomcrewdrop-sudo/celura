// ============================================================
//  CELURA · Notifications Bell (solo trigger del drawer global)
// ============================================================

import { Bell } from 'lucide-react'
import clsx from 'clsx'
import { useNotifications } from '@/hooks/useNotifications'

export default function NotificationsBell() {
  const { unread, liveConnected, openDrawer } = useNotifications()

  return (
    <button
      type="button"
      onClick={openDrawer}
      className={clsx(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-zinc-300 transition-all hover:border-white/[0.10] hover:bg-white/[0.06] hover:text-white',
        unread > 0 && 'text-white',
      )}
      aria-label={`Notificaciones (${unread} sin leer)`}
    >
      <Bell className={clsx('h-4 w-4', unread > 0 && 'animate-bell')} />
      {unread > 0 && (
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-lime-400 px-1 text-[10px] font-bold text-dark-900 shadow-lg shadow-lime-400/30">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
      {liveConnected && unread === 0 && (
        <span className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-lime-400/60" />
      )}
    </button>
  )
}
