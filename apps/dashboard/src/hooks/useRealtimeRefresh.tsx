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

    const channel = supabase
      .channel(`clinic-stream:${clinic.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `clinic_id=eq.${clinic.id}` },
        () => dispatch('leads-changed'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `clinic_id=eq.${clinic.id}` },
        () => {
          dispatch('conversations-changed')
          // Un cambio en una conversación suele significar mensaje nuevo →
          // típicamente también afecta al lead (last_message_at, score).
          dispatch('leads-changed')
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `clinic_id=eq.${clinic.id}` },
        () => dispatch('appointments-changed'),
      )
      .subscribe()

    return () => {
      // Limpiar debouncers pendientes
      for (const [, id] of debouncesRef.current) window.clearTimeout(id)
      debouncesRef.current.clear()
      supabase.removeChannel(channel)
    }
  }, [clinic?.id])
}
