// ============================================================
//  CELURA · Toast stack para notifs realtime
//  ------------------------------------------------------------
//  Cada toast queda visible 6s. Permite click → navigate.
//  Posición: top-right desktop, top-center mobile.
// ============================================================

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { useNotifications, type AppNotification, type NotificationSeverity } from '@/hooks/useNotifications'

const SEVERITY_BORDER: Record<NotificationSeverity, string> = {
  info: 'border-sky-400/30 shadow-sky-400/10',
  success: 'border-lime-400/30 shadow-lime-400/10',
  warning: 'border-amber-400/30 shadow-amber-400/10',
  critical: 'border-red-400/40 shadow-red-400/15',
}

const SEVERITY_BAR: Record<NotificationSeverity, string> = {
  info: 'bg-sky-400',
  success: 'bg-lime-400',
  warning: 'bg-amber-400',
  critical: 'bg-red-400',
}

const AUTO_DISMISS_MS = 6000

export default function NotificationsToastStack() {
  const { toasts, dismissToast, markRead } = useNotifications()

  return (
    <div
      aria-live="polite"
      className="safe-pt pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:left-auto sm:right-4 sm:top-4 sm:items-end sm:px-0"
    >
      {toasts.slice(-3).map((t) => (
        <ToastCard
          key={t.id}
          t={t}
          onDismiss={() => dismissToast(t.id)}
          onClick={() => {
            void markRead(t.id)
            dismissToast(t.id)
          }}
        />
      ))}
    </div>
  )
}

function ToastCard({
  t, onDismiss, onClick,
}: {
  t: AppNotification
  onDismiss: () => void
  onClick: () => void
}) {
  const navigate = useNavigate()
  const sev = t.severity

  useEffect(() => {
    const id = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(id)
  }, [onDismiss])

  const handleClick = () => {
    onClick()
    if (t.action_url) navigate(t.action_url)
  }

  return (
    <div
      role="status"
      className={clsx(
        'pointer-events-auto group relative w-full max-w-[360px] overflow-hidden rounded-2xl border bg-dark-800/95 shadow-xl backdrop-blur-md',
        SEVERITY_BORDER[sev],
        'animate-slide-down sm:animate-slide-left',
      )}
    >
      {/* Barra de severidad */}
      <span className={clsx('absolute left-0 top-0 h-full w-1', SEVERITY_BAR[sev])} />

      <button
        onClick={handleClick}
        className="block w-full text-left"
      >
        <div className="flex items-start gap-2 px-4 py-3 pl-5">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-snug text-white">
              {t.title}
            </p>
            {t.body && (
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-zinc-400">
                {t.body}
              </p>
            )}
            {t.action_label && (
              <p className="mt-1 text-[11px] font-medium text-lime-300">
                {t.action_label} →
              </p>
            )}
          </div>
        </div>
      </button>

      <button
        onClick={onDismiss}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
        aria-label="Cerrar"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Progress bar */}
      <span
        className={clsx('absolute bottom-0 left-0 h-[2px] origin-left', SEVERITY_BAR[sev])}
        style={{ animation: `shrink ${AUTO_DISMISS_MS}ms linear forwards` }}
      />
    </div>
  )
}
