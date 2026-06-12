// ============================================================
//  CELURA · Notifications — Bell (trigger) + Drawer (panel)
// ============================================================

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Archive,
  Calendar,
  CalendarPlus,
  CalendarX,
  CalendarSync,
  UserPlus,
  UserX,
  Users,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Info,
  WifiOff,
  Wifi,
  Sparkles,
  CreditCard,
  Clock,
  BarChart3,
  Megaphone,
  BellRing,
  Settings as SettingsIcon,
} from 'lucide-react'
import clsx from 'clsx'
import { useNotifications, type AppNotification, type NotificationSeverity } from '@/hooks/useNotifications'

// Mapeo de nombre de icono → componente Lucide
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Bell, BellRing, Calendar, CalendarPlus, CalendarX, CalendarSync,
  UserPlus, UserX, Users, MessageSquare, AlertTriangle, CheckCircle2,
  Info, WifiOff, Wifi, Sparkles, CreditCard, Clock, BarChart3, Megaphone,
}

function iconFor(n: AppNotification): React.ComponentType<{ className?: string }> {
  if (n.icon && ICON_MAP[n.icon]) return ICON_MAP[n.icon]!
  // Fallback por kind
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

// ─── Bell ──────────────────────────────────────────────────
export default function NotificationsBell() {
  const { unread, liveConnected } = useNotifications()
  const [open, setOpen] = useState(false)

  const hasCritical = useMemo(() => unread > 0, [unread])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={clsx(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-zinc-300 transition-all hover:border-white/[0.10] hover:bg-white/[0.06] hover:text-white',
          unread > 0 && 'text-white',
        )}
        aria-label={`Notificaciones (${unread} sin leer)`}
      >
        <Bell className={clsx('h-4 w-4', hasCritical && unread > 0 && 'animate-bell')} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-lime-400 px-1 text-[10px] font-bold text-dark-900 shadow-lg shadow-lime-400/30">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
        {/* Indicador de canal vivo */}
        {liveConnected && unread === 0 && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-lime-400/60" />
        )}
      </button>

      <NotificationsDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}

// ─── Drawer ────────────────────────────────────────────────
function NotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, loading, unread, markRead, markAllRead, archive, refresh, loadMore, hasMore } = useNotifications()
  const navigate = useNavigate()

  // Refresh al abrir
  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Lock body scroll
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Agrupar por fecha
  const grouped = useMemo(() => groupByDate(items), [items])

  const handleClick = async (n: AppNotification) => {
    if (!n.read_at) await markRead(n.id)
    if (n.action_url) {
      onClose()
      navigate(n.action_url)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={clsx(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className={clsx(
          'safe-pt safe-pb fixed right-0 top-0 z-50 flex h-dscreen w-full max-w-[420px] flex-col border-l border-white/[0.06] bg-dark-800 shadow-2xl shadow-black/60 transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-400/[0.08] ring-1 ring-lime-400/20">
              <Bell className="h-4 w-4 text-lime-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Notificaciones</h2>
              <p className="text-[11px] text-zinc-500">
                {unread > 0 ? `${unread} sin leer` : 'Estás al día'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="touch-target flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
                aria-label="Marcar todas leídas"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Todas
              </button>
            )}
            <button
              onClick={() => {
                onClose()
                navigate('/notifications/preferences')
              }}
              className="touch-target flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              aria-label="Preferencias"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="touch-target flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
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
                        onClick={() => void handleClick(n)}
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
    </>
  )
}

// ─── Notif Row ─────────────────────────────────────────────
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
        isUnread
          ? clsx('ring-1', sty.ring, sty.bg)
          : 'hover:bg-white/[0.03]',
      )}
    >
      {/* Dot unread */}
      {isUnread && (
        <span className={clsx('absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full', sty.dot)} />
      )}

      {/* Icon */}
      <button
        onClick={onClick}
        className={clsx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-all',
          isUnread ? clsx(sty.bg, sty.ring) : 'bg-white/[0.04] ring-white/[0.06]',
        )}
      >
        <Icon className={clsx('h-4 w-4', isUnread ? sty.text : 'text-zinc-400')} />
      </button>

      {/* Body */}
      <button
        onClick={onClick}
        className="min-w-0 flex-1 text-left"
      >
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

      {/* Actions */}
      <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {isUnread && (
          <button
            onClick={onMarkRead}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
            aria-label="Marcar leída"
            title="Marcar leída"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
        <button
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

// ─── Empty ─────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────
function groupByDate(items: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400_000
  const weekAgo = today - 7 * 86400_000

  const buckets: Record<string, AppNotification[]> = {
    'Hoy': [],
    'Ayer': [],
    'Esta semana': [],
    'Anteriores': [],
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
