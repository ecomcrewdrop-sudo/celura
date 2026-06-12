// ============================================================
//  CELURA · Hook de notificaciones in-app
//  ------------------------------------------------------------
//   • Carga inicial via REST (/api/notifications + unread-count)
//   • Suscripción Realtime al canal `notifications:${clinic_id}`
//   • Acciones: markRead, markAllRead, archive, refresh
//   • Toast queue: cada notif nueva entra a un buffer que
//     el provider de Toast consume.
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'
import { useClinic } from './useClinic'

// ─── Tipos ─────────────────────────────────────────────────
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical'

export type NotificationKind =
  | 'welcome'
  | 'wa_connected'
  | 'wa_disconnected'
  | 'appointment_new'
  | 'appointment_reminder_24h'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'lead_new'
  | 'lead_high_value'
  | 'message_urgent'
  | 'trial_ending'
  | 'trial_ended'
  | 'payment_pending'
  | 'payment_received'
  | 'daily_summary'
  | 'admin_announcement'
  | 'system'
  | 'custom'

export interface AppNotification {
  id: string
  kind: NotificationKind
  severity: NotificationSeverity
  title: string
  body: string | null
  icon: string | null
  action_url: string | null
  action_label: string | null
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown>
  read_at: string | null
  archived_at: string | null
  expires_at: string | null
  created_at: string
}

interface ListResponse {
  items: AppNotification[]
  next_cursor: string | null
}

interface CountResponse {
  unread: number
}

interface NotificationsCtx {
  items: AppNotification[]
  unread: number
  loading: boolean
  liveConnected: boolean
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  hasMore: boolean
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  archive: (id: string) => Promise<void>
  // Drawer global
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  // Toast queue
  toasts: AppNotification[]
  dismissToast: (id: string) => void
}

const NotificationsContext = createContext<NotificationsCtx | null>(null)

// ─── Provider ─────────────────────────────────────────────
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { clinic } = useClinic()
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [liveConnected, setLiveConnected] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [toasts, setToasts] = useState<AppNotification[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Track ids ya vistos para dedup del realtime
  const seenIdsRef = useRef<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    if (!clinic?.id) return
    setLoading(true)
    const [list, count] = await Promise.all([
      api.get<ListResponse>('/api/notifications?limit=30'),
      api.get<CountResponse>('/api/notifications/unread-count'),
    ])
    if (list.data) {
      const arr = list.data.items
      seenIdsRef.current = new Set(arr.map((n) => n.id))
      setItems(arr)
      setCursor(list.data.next_cursor)
      setHasMore(!!list.data.next_cursor)
    }
    if (count.data) setUnread(count.data.unread)
    setLoading(false)
  }, [clinic?.id])

  const loadMore = useCallback(async () => {
    if (!cursor) return
    const res = await api.get<ListResponse>(
      `/api/notifications?limit=30&cursor=${encodeURIComponent(cursor)}`,
    )
    if (res.data) {
      const merged = [...items, ...res.data.items.filter((n) => !seenIdsRef.current.has(n.id))]
      res.data.items.forEach((n) => seenIdsRef.current.add(n.id))
      setItems(merged)
      setCursor(res.data.next_cursor)
      setHasMore(!!res.data.next_cursor)
    }
  }, [cursor, items])

  // Carga inicial
  useEffect(() => {
    void refresh()
  }, [refresh])

  // Realtime: nuevas notifs entran por el canal
  useEffect(() => {
    if (!clinic?.id) return
    const channel = supabase
      .channel(`notifications:${clinic.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `clinic_id=eq.${clinic.id}`,
        },
        (payload) => {
          const newRow = payload.new as AppNotification
          if (!newRow?.id || seenIdsRef.current.has(newRow.id)) return
          seenIdsRef.current.add(newRow.id)
          setItems((prev) => [newRow, ...prev])
          if (!newRow.read_at) setUnread((u) => u + 1)
          // Solo toastear las recientes (no expiradas)
          if (!newRow.expires_at || new Date(newRow.expires_at) > new Date()) {
            setToasts((t) => [...t, newRow])
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `clinic_id=eq.${clinic.id}`,
        },
        (payload) => {
          const upd = payload.new as AppNotification
          if (!upd?.id) return
          setItems((prev) => prev.map((n) => (n.id === upd.id ? upd : n)))
        },
      )
      .subscribe((status) => setLiveConnected(status === 'SUBSCRIBED'))

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [clinic?.id])

  // ─── Acciones ─────────────────────────────────────────
  const markRead = useCallback(async (id: string) => {
    // optimistic
    setItems((prev) =>
      prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)),
    )
    setUnread((u) => Math.max(0, u - 1))
    await api.post(`/api/notifications/${id}/read`, {})
  }, [])

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
    setUnread(0)
    await api.post('/api/notifications/mark-all-read', {})
  }, [])

  const archive = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id))
    await api.post(`/api/notifications/${id}/archive`, {})
    // Si era unread, ya lo descontamos visualmente con mark-all? No.
    // Recargamos contador para estar seguros:
    const count = await api.get<CountResponse>('/api/notifications/unread-count')
    if (count.data) setUnread(count.data.unread)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const value = useMemo<NotificationsCtx>(
    () => ({
      items,
      unread,
      loading,
      liveConnected,
      refresh,
      loadMore,
      hasMore,
      markRead,
      markAllRead,
      archive,
      drawerOpen,
      openDrawer,
      closeDrawer,
      toasts,
      dismissToast,
    }),
    [items, unread, loading, liveConnected, refresh, loadMore, hasMore, markRead, markAllRead, archive, drawerOpen, openDrawer, closeDrawer, toasts, dismissToast],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications(): NotificationsCtx {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}
