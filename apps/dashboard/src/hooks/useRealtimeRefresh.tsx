// ============================================================
//  CELURA · useRealtimeRefresh
//  Hook GLOBAL que mantiene UNA suscripción Supabase Realtime
//  por clínica y emite CustomEvents en `window` cuando hay
//  cambios. Cada página relevante (DashboardHome, Leads,
//  Appointments, Conversations) solo escucha el evento que
//  le importa y refetcha sus datos — sin tener que mantener
//  su propia conexión.
//
//  Eventos emitidos:
//    'celura:leads-changed'         → cualquier cambio en leads
//    'celura:conversations-changed' → cualquier cambio en conversations
//    'celura:appointments-changed'  → cualquier cambio en appointments
//    'celura:any-changed'           → cualquiera de los anteriores
//
//  Los eventos están debounceados a ~250ms: si Supabase
//  dispara 10 cambios en 200ms (típico cuando llega un
//  mensaje que crea lead + conv + notif) refetchamos UNA vez.
// ============================================================

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useClinic } from '@/hooks/useClinic'

export type RealtimeTopic =
  | 'leads-changed'
  | 'conversations-changed'
  | 'appointments-changed'
  | 'any-changed'

const DEBOUNCE_MS = 250

/**
 * Helper para que las páginas se suscriban a un topic concreto.
 * Devuelve un cleanup que se llama al unmount.
 *
 * Uso típico:
 *   useRealtimeTopic('leads-changed', fetchLeads)
 */
export function useRealtimeTopic(topic: RealtimeTopic, handler: () => void): void {
  // Guardamos el handler en un ref para que no resuscribir cada render.
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const eventName = `celura:${topic}`
    const listener = () => handlerRef.current()
    window.addEventListener(eventName, listener)
    return () => window.removeEventListener(eventName, listener)
  }, [topic])
}

/**
 * Hook que monta las suscripciones globales. Se llama UNA SOLA VEZ
 * (desde Layout). Sin retorno: solo dispatcha eventos por window.
 */
// Intervalo del fallback por polling cuando la pestaña está visible.
// Aunque la publication de Realtime esté mal configurada, las páginas
// igual refrescan a este ritmo. 6s = sensación "viva" sin matar el plan.
const POLL_FALLBACK_MS = 6_000

export function useRealtimeRefresh(): void {
  const { clinic } = useClinic()
  const debouncesRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!clinic?.id) return

    const dispatch = (topic: RealtimeTopic) => {
      const eventName = `celura:${topic}`
      // Debounce por topic: cancelamos timer pendiente y reprogramamos.
      const existing = debouncesRef.current.get(eventName)
      if (existing) window.clearTimeout(existing)
      const id = window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(eventName))
        // Cualquier cambio también emite 'any-changed' para listeners genéricos.
        window.dispatchEvent(new CustomEvent('celura:any-changed'))
        debouncesRef.current.delete(eventName)
      }, DEBOUNCE_MS)
      debouncesRef.current.set(eventName, id)
    }

    // Emite TODOS los topics de golpe (usado en visibilitychange y polling).
    const dispatchAll = () => {
      dispatch('leads-changed')
      dispatch('conversations-changed')
      dispatch('appointments-changed')
    }

    const channel = supabase
      .channel(`clinic-stream:${clinic.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `clinic_id=eq.${clinic.id}` },
        () => {
          console.debug('[realtime] leads change')
          dispatch('leads-changed')
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `clinic_id=eq.${clinic.id}` },
        () => {
          console.debug('[realtime] conversations change')
          dispatch('conversations-changed')
          // Un cambio en una conversación suele significar mensaje nuevo →
          // típicamente también afecta al lead (last_message_at, score).
          dispatch('leads-changed')
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `clinic_id=eq.${clinic.id}` },
        () => {
          console.debug('[realtime] appointments change')
          dispatch('appointments-changed')
          // Si se cierra una cita, el lead típicamente cambia stage también.
          dispatch('leads-changed')
        },
      )
      .subscribe((status) => {
        // status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'
        console.debug('[realtime] channel status:', status)
      })

    // ── Fallback por polling ─────────────────────────────────
    // Si la publication de Supabase Realtime no está bien configurada
    // (caso típico: una migración aún no aplicada en prod), Realtime
    // nunca emite eventos y el panel queda estático. Para que el doctor
    // SIEMPRE vea movimiento, cada N segundos hacemos un "tick" que
    // dispara los mismos topics — debounceados, así que si Realtime sí
    // está funcionando, no causa doble-fetch.
    let pollIntervalId: number | null = null
    const startPolling = () => {
      if (pollIntervalId !== null) return
      pollIntervalId = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          dispatchAll()
        }
      }, POLL_FALLBACK_MS)
    }
    const stopPolling = () => {
      if (pollIntervalId !== null) {
        window.clearInterval(pollIntervalId)
        pollIntervalId = null
      }
    }

    // Al volver a la pestaña, refresca de inmediato y reanuda polling.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        dispatchAll()
        startPolling()
      } else {
        stopPolling()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    startPolling()

    return () => {
      // Limpiar debouncers pendientes
      for (const [, id] of debouncesRef.current) window.clearTimeout(id)
      debouncesRef.current.clear()
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibility)
      supabase.removeChannel(channel)
    }
  }, [clinic?.id])
}
