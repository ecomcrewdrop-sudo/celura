// ============================================================
//  CELURA · Plantillas de workflows pre-armadas
//  Para que el doctor arranque con algo que YA funciona y
//  entienda el modelo viéndolo. Se pueden duplicar y editar.
// ============================================================

import type { WorkflowGraph } from './workflow-types'

const id = (prefix: string, n: number) => `${prefix}_${n}_${Math.random().toString(36).slice(2, 7)}`

export interface WorkflowTemplate {
  key: string
  name: string
  description: string
  emoji: string
  priority: number
  build: () => WorkflowGraph
}

export const TEMPLATES: WorkflowTemplate[] = [
  // ── 1. Bienvenida + captura de nombre ─────────────────
  {
    key: 'welcome',
    name: 'Bienvenida y captura de nombre',
    description: 'Saluda al paciente nuevo, captura su nombre y abre la conversación.',
    emoji: '👋',
    priority: 50,
    build: () => {
      const t = id('trg', 1)
      const a1 = id('act', 1)
      const a2 = id('act', 2)
      return {
        trigger: { id: t, type: 'new_patient', params: {}, next: a1 },
        blocks: {
          [a1]: {
            id: a1, kind: 'action', type: 'send_message',
            params: { text: '¡Hola! Soy {{assistant}}, asistente de la clínica. ¿En qué te puedo ayudar hoy?' },
            next: a2,
          },
          [a2]: {
            id: a2, kind: 'action', type: 'ask_qualifying',
            params: { question: 'Para atenderte mejor, ¿me dices tu nombre?', save_to: 'name' },
            next: null,
          },
        },
      }
    },
  },

  // ── 2. Dolor / urgencia con escalamiento ──────────────
  {
    key: 'pain_emergency',
    name: 'Dolor o urgencia → escalar',
    description: 'Detecta dolor agudo, ofrece atención inmediata y escala a un humano.',
    emoji: '🚨',
    priority: 90,
    build: () => {
      const t = id('trg', 1)
      const c1 = id('cnd', 1)
      const a1 = id('act', 1)
      const a2 = id('act', 2)
      const a3 = id('act', 3)
      const a4 = id('act', 4)
      return {
        trigger: {
          id: t, type: 'keyword_match',
          params: { keywords: ['dolor', 'duele', 'urgencia', 'emergencia', 'roto', 'sangra'] },
          next: c1,
        },
        blocks: {
          [c1]: {
            id: c1, kind: 'condition', type: 'is_business_hours', params: {},
            next: a1, next_else: a3,
          },
          [a1]: {
            id: a1, kind: 'action', type: 'ai_respond',
            params: {
              instructions: 'Reconoce el dolor con empatía. Ofrece atención prioritaria HOY. Pregunta si puede venir esta tarde.',
              max_lines: 3,
            },
            next: a2,
          },
          [a2]: { id: a2, kind: 'action', type: 'set_urgency', params: { level: 'high' }, next: null },
          [a3]: {
            id: a3, kind: 'action', type: 'send_message',
            params: { text: 'Lamento mucho que estés con dolor. Estamos fuera de horario, pero un doctor te contactará en cuanto abramos. Si es muy grave, te recomiendo ir a urgencias.' },
            next: a4,
          },
          [a4]: { id: a4, kind: 'action', type: 'escalate_to_human', params: { reason: 'urgencia fuera de horario' }, next: null },
        },
      }
    },
  },

  // ── 3. Pregunta precio → cotiza rango + invita ────────
  {
    key: 'price_inquiry',
    name: 'Precio → cotizar y agendar',
    description: 'Cuando preguntan precio: da rango orientativo e invita a valoración.',
    emoji: '💰',
    priority: 40,
    build: () => {
      const t = id('trg', 1)
      const a1 = id('act', 1)
      const a2 = id('act', 2)
      return {
        trigger: { id: t, type: 'intent_detected', params: { intent: 'price' }, next: a1 },
        blocks: {
          [a1]: {
            id: a1, kind: 'action', type: 'ai_respond',
            params: {
              instructions: 'Da un rango de precio aproximado para el tratamiento que pregunta. Explica que el precio final depende del caso e invita a una valoración sin costo.',
              max_lines: 4,
            },
            next: a2,
          },
          [a2]: { id: a2, kind: 'action', type: 'offer_appointment', params: { treatment: '' }, next: null },
        },
      }
    },
  },

  // ── 4. Recibe foto → analiza y sugiere ────────────────
  {
    key: 'photo_flow',
    name: 'Foto → análisis clínico + sugerir',
    description: 'Cuando manda foto: analiza con Vision, según hallazgo escala o sugiere tratamiento.',
    emoji: '📸',
    priority: 80,
    build: () => {
      const t = id('trg', 1)
      const a1 = id('act', 1)
      const c1 = id('cnd', 1)
      const a2 = id('act', 2)
      const a3 = id('act', 3)
      const a4 = id('act', 4)
      return {
        trigger: { id: t, type: 'photo_received', params: {}, next: a1 },
        blocks: {
          [a1]: { id: a1, kind: 'action', type: 'analyze_photo', params: {}, next: c1 },
          [c1]: {
            id: c1, kind: 'condition', type: 'photo_finding',
            params: { area: '', min_severity: 'severo' },
            next: a2, next_else: a4,
          },
          [a2]: {
            id: a2, kind: 'action', type: 'ai_respond',
            params: {
              instructions: 'Sé empático: hay un hallazgo severo. Recomienda atención urgente, sin alarmar. Ofrece cita hoy o mañana.',
              max_lines: 4,
            },
            next: a3,
          },
          [a3]: { id: a3, kind: 'action', type: 'set_urgency', params: { level: 'high' }, next: null },
          [a4]: {
            id: a4, kind: 'action', type: 'ai_respond',
            params: {
              instructions: 'Describe lo observado con calma. Sugiere tratamiento adecuado e invita a agendar una valoración para confirmar.',
              max_lines: 4,
            },
            next: null,
          },
        },
      }
    },
  },
]
