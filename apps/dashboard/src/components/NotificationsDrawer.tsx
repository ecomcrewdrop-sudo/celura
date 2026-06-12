// ============================================================
//  CELURA · Notifications Drawer (global, portal, auto-close)
//  ------------------------------------------------------------
//  Una sola instancia montada en Layout. El estado vive en
//  el contexto de useNotifications. Se cierra:
//   • con la X
//   • con click fuera (backdrop)
//   • con tecla ESC
//   • cuando cambia la ruta (location.pathname)
// ============================================================

import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Bell, X, Check, CheckCheck, Archive,
  Calendar, CalendarPlus, CalendarX, CalendarSync,
  UserPlus, UserX, Users, MessageSquare, AlertTriangle, CheckCircle2,
  Info, WifiOff, Wifi, Sparkles, CreditCard, Clock,
  BarChart3, Megaphone, BellRing, Settings as SettingsIcon,
} from 'lucide-react'
import clsx from 'clsx'
import { useNotifications, type AppNotification, type NotificationSeverity } from '@/hooks/useNotifications'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Bell, BellRing, Calendar, CalendarPlus, CalendarX, CalendarSync,
  UserPlus, UserX, Users, MessageSquare, AlertTriangle, CheckCircle2,
  Info, WifiOff, Wifi, Sparkles, CreditCard, Clock, BarChart3, Megaphone,
}

function iconFor(n: AppNotification): React.ComponentType<{ className?: string }> {
  if (n.icon && ICON_MAP[n.icon]) return ICON_MAP[n.icon]!
  switch (n.kind) {
    case 'wa_connected': return Wifi
    case 'wa_disconnected': return WifiOff
    case 'appointment_new': return CalendarPlus
    case 'appointment_reminder_24h': return Clock
    case 'appointment_cancelled': return CalendarX
    case 'appointment_rescheduled': return CalendarSync
    case 'lead_new': return UserPlus
    case 'lead_high_value': return AlertTriangle
    case 'message_urgent': return MessageSquare
    case 'trial_ending':
    case 'trial_ended': return Clock
    case 'payment_pending':
    case 'payment_received': return CreditCard
    case 'daily_summary': return BarChart3
    case 'admin_announcement': return Megaphone
    case 'welcome': return Sparkles
    default: return Bell
  }
}

const SEVERITY_STYLE: Record<NotificationSeverity, { ring: string; bg: string; text: string; dot: string }> = {
  info:     { ring: 'ring-white/[0.08]',  bg: 'bg-white/[0.04]',   text: 'text-zinc-300', dot: 'bg-sky-400' },
  success:  { ring: 'ring-lime-400/20',   bg: 'bg-lime-400/[0.07]',text: 'text-lime-300', dot: 'bg-lime-400' },
  warning:  { ring: 'ring-amber-400/20',  bg: 'bg-amber-400/[0.07]',text: 'text-amber-300',dot: 'bg-amber-400' },
  critical: { ring: 'ring-red-400/25',    bg: 'bg-red-400/[0.08]', text: 'text-red-300',  dot: 'bg-red-400' },
}

export default function NotificationsDrawer() {
  const {
    items, loading, unread,
    drawerOpen, closeDrawer,
    markRead, markAllRead, archive,
    refresh, loadMore, hasMore,
  } = useNotifications()
  const navigate = useNavigate()
  const location = useLocation()

  // Refresh al abrir
  useEffect(() => {
    if (drawerOpen) void refresh()
  }, [drawerOpen, refresh])

  // ESC cierra
  useEffect(() => {
    if (!drawerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [drawerOpen, closeDrawer])

  // Lock body scroll cuando está abierto
  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [drawerOpen])

  // Auto-close cuando cambia la ruta (cualquier navegación lo cierra)
  useEffect(() => {
    closeDrawer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const grouped = useMemo(() => groupByDate(items), [items])

  const handleItemClick = async (n: AppNotification) => {
    if (!n.read_at) await markRead(n.id)
    if (n.action_url) {
      closeDrawer()
      navigate(n.action_url)
    }
  }

  // Renderizar en portal a document.body para evitar
  // problemas con z-index o transform en parents.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      aria-hidden={!drawerOpen}
      className={clsx(
        'fixed inset-0 z-[100]',
        drawerOpen ? 'pointer-events-auto' : 'pointer-events-none',
      )}
    >
      {/* Backdrop */}
      <button
        type="button"
        onClick={closeDrawer}
        aria-label="Cerrar notificaciones"
        className={clsx(
          'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200',
          drawerOpen ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Notificaciones"
        className={clsx(
          'safe-pt safe-pb absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col border-l border-white/[0.06] bg-dark-800 shadow-2xl shadow-black/60 transition-transform duration-300 ease-out',
          drawerOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime-400/[0.08] ring-1 ring-lime-400/20">
              <Bell className="h-4 w-4 text-lime-400" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-white">Notificaciones</h2>
              <p className="truncate text-[11px] text-zinc-500">
                {unread > 0 ? `${unread} sin leer` : 'Estás al día'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
                aria-label="Marcar todas leídas"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Todas</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                closeDrawer()
                navigate('/notifications/preferences')
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
              aria-label="Preferencias"
              title="Preferencias"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
            {/* X — grande, fácil de pulsar en mobile */}
            <button
              type="button"
              onClick={closeDrawer}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Cerrar"
              title="Cerrar (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-lime-400" />
              <p className="mt-3 text-[12px] text-zinc-500">Cargando…</p>
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="px-2 py-3">
              {grouped.map(({ label, items: group }) => (
                <div key={label} className="mb-4">
                  <h3 className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {label}
                  </h3>
                  <div className="space-y-1">
                    {group.map((n) => (
                      <NotifRow
                        key={n.id}
                        n={n}
                        onClick={() => void handleItemClick(n)}
                        onArchive={() => void archive(n.id)}
                        onMarkRead={() => void markRead(n.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {hasMore && (
                <div className="px-3 pb-4 pt-2">
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] py-2.5 text-[12px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
                  >
                    Cargar más
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

function NotifRow({
  n, onClick, onArchive, onMarkRead,
}: {
  n: AppNotification
  onClick: () => void
  onArchive: () => void
  onMarkRead: () => void
}) {
  const Icon = iconFor(n)
  const sty = SEVERITY_STYLE[n.severity]
  const isUnread = !n.read_at

  return (
    <div
      className={clsx(
        'group relative flex items-start gap-3 rounded-xl px-3 py-3 transition-all',
        isUnread ? clsx('ring-1', sty.ring, sty.bg) : 'hover:bg-white/[0.03]',
      )}
    >
      {isUnread && (
        <span className={clsx('absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full', sty.dot)} />
      )}

      <button
        type="button"
        onClick={onClick}
        className={clsx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-all',
          isUnread ? clsx(sty.bg, sty.ring) : 'bg-white/[0.04] ring-white/[0.06]',
        )}
      >
        <Icon className={clsx('h-4 w-4', isUnread ? sty.text : 'text-zinc-400')} />
      </button>

      <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
        <p className={clsx('truncate text-[13px] font-semibold', isUnread ? 'text-white' : 'text-zinc-300')}>
          {n.title}
        </p>
        {n.body && (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-zinc-500">
            {n.body}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-600">
          <span>{relativeTime(n.created_at)}</span>
          {n.action_label && (
            <>
              <span className="text-zinc-700">·</span>
              <span className={clsx('font-medium', sty.text)}>
                {n.action_label} →
              </span>
            </>
          )}
        </div>
      </button>

      <div className="flex shrink-0 flex-col gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
        {isUnread && (
          <button
            type="button"
            onClick={onMarkRead}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
            aria-label="Marcar leída"
            title="Marcar leída"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onArchive}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
          aria-label="Archivar"
          title="Archivar"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-lime-400/20" style={{ animationDuration: '2.5s' }} />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-lime-400/20 bg-lime-400/[0.06]">
          <BellRing className="h-7 w-7 text-lime-400" />
        </div>
      </div>
      <h3 className="mt-5 text-sm font-semibold text-white">Estás al día</h3>
      <p className="mt-1 max-w-[260px] text-[12px] leading-relaxed text-zinc-500">
        Cuando algo importante pase en tu clínica, te avisaremos acá.
      </p>
    </div>
  )
}

function groupByDate(items: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400_000
  const weekAgo = today - 7 * 86400_000

  const buckets: Record<string, AppNotification[]> = {
    'Hoy': [], 'Ayer': [], 'Esta semana': [], 'Anteriores': [],
  }

  for (const n of items) {
    const t = new Date(n.created_at).getTime()
    if (t >= today) buckets['Hoy']!.push(n)
    else if (t >= yesterday) buckets['Ayer']!.push(n)
    else if (t >= weekAgo) buckets['Esta semana']!.push(n)
    else buckets['Anteriores']!.push(n)
  }

  return Object.entries(buckets)
    .filter(([, arr]) => arr.length > 0)
    .map(([label, arr]) => ({ label, items: arr }))
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} d`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
