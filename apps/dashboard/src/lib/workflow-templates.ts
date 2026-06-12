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

  // ── 5. Recordatorio 24h pre-cita ─────────────────────
  {
    key: 'reminder_24h',
    name: 'Recordatorio 24h antes de cita',
    description: 'Envía la plantilla configurada de recordatorio el día anterior.',
    emoji: '⏰',
    priority: 70,
    build: () => {
      const t = id('trg', 1)
      const c1 = id('cnd', 1)
      const a1 = id('act', 1)
      const a2 = id('act', 2)
      return {
        trigger: { id: t, type: 'appointment_confirmed', params: {}, next: c1 },
        blocks: {
          [c1]: {
            id: c1, kind: 'condition', type: 'quiet_hours_now', params: {},
            next: a2, next_else: a1,
          },
          [a1]: { id: a1, kind: 'action', type: 'send_template', params: { template_key: 'pre_appt_24h' }, next: null },
          [a2]: { id: a2, kind: 'action', type: 'respect_quiet_hours', params: {}, next: a1 },
        },
      }
    },
  },

  // ── 6. Pos-visita + pedido de reseña ─────────────────
  {
    key: 'post_visit_review',
    name: 'Pos-visita → pedido de reseña',
    description: 'Tras la consulta agradece, pregunta cómo se siente y pide reseña.',
    emoji: '⭐',
    priority: 60,
    build: () => {
      const t = id('trg', 1)
      const a1 = id('act', 1)
      const a2 = id('act', 2)
      const a3 = id('act', 3)
      return {
        trigger: { id: t, type: 'appointment_completed', params: {}, next: a1 },
        blocks: {
          [a1]: { id: a1, kind: 'action', type: 'send_template', params: { template_key: 'post_appt_1h' }, next: a2 },
          [a2]: { id: a2, kind: 'action', type: 'wait_minutes', params: { minutes: 60 * 24 }, next: a3 },
          [a3]: { id: a3, kind: 'action', type: 'send_template', params: { template_key: 'post_appt_review' }, next: null },
        },
      }
    },
  },

  // ── 7. Reactivación de paciente inactivo ─────────────
  {
    key: 'reactivation',
    name: 'Reactivación de inactivos',
    description: 'Si lleva ≥ N días sin responder, envía mensaje de reactivación.',
    emoji: '🔁',
    priority: 30,
    build: () => {
      const t = id('trg', 1)
      const c1 = id('cnd', 1)
      const a1 = id('act', 1)
      return {
        trigger: { id: t, type: 'lead_inactive_days', params: { days: 30 }, next: c1 },
        blocks: {
          [c1]: {
            id: c1, kind: 'condition', type: 'stage_is', params: { stage: 'lost' },
            next: a1, next_else: a1,
          },
          [a1]: { id: a1, kind: 'action', type: 'send_template', params: { template_key: 'reactivation' }, next: null },
        },
      }
    },
  },

  // ── 8. Objeción de precio ────────────────────────────
  {
    key: 'objection_price',
    name: 'Objeción de precio → rango + valoración',
    description: 'Cuando dice "está caro", da rango orientativo y desplaza el valor a la cita.',
    emoji: '💸',
    priority: 65,
    build: () => {
      const t = id('trg', 1)
      const a1 = id('act', 1)
      const a2 = id('act', 2)
      return {
        trigger: { id: t, type: 'objection_detected', params: { kind: 'price' }, next: a1 },
        blocks: {
          [a1]: {
            id: a1, kind: 'action', type: 'ai_respond',
            params: {
              instructions: 'Reconoce la preocupación con empatía. Da rango aproximado (sin inventar). Recuerda que el valor real solo se confirma con la valoración. Cierra invitando a esa cita sin presión.',
              max_lines: 4,
            },
            next: a2,
          },
          [a2]: { id: a2, kind: 'action', type: 'offer_appointment', params: { treatment: '' }, next: null },
        },
      }
    },
  },

  // ── 9. Objeción "lo pienso" → reservar espacio ───────
  {
    key: 'objection_thinking',
    name: 'Objeción "lo pienso" → reservar',
    description: 'Si dice "lo pensaré", reserva el espacio mientras decide.',
    emoji: '🤔',
    priority: 60,
    build: () => {
      const t = id('trg', 1)
      const a1 = id('act', 1)
      const a2 = id('act', 2)
      return {
        trigger: { id: t, type: 'objection_detected', params: { kind: 'thinking' }, next: a1 },
        blocks: {
          [a1]: {
            id: a1, kind: 'action', type: 'ai_respond',
            params: {
              instructions: 'Acepta sin presionar. Comenta que reservas el espacio mientras decide y pide que avise si surge algo. Cierra con pregunta suave de confirmación.',
              max_lines: 3,
            },
            next: a2,
          },
          [a2]: { id: a2, kind: 'action', type: 'tag_lead', params: { tag: 'lo_piensa' }, next: null },
        },
      }
    },
  },

  // ── 10. Mencionó otra clínica ────────────────────────
  {
    key: 'objection_competitor',
    name: 'Compara con otra clínica',
    description: 'Si menciona competencia, valida diferenciales sin atacar al competidor.',
    emoji: '🏥',
    priority: 55,
    build: () => {
      const t = id('trg', 1)
      const a1 = id('act', 1)
      return {
        trigger: { id: t, type: 'objection_detected', params: { kind: 'competitor' }, next: a1 },
        blocks: {
          [a1]: {
            id: a1, kind: 'action', type: 'ai_respond',
            params: {
              instructions: 'No critiques al competidor. Reconoce que hay opciones más económicas. Resalta materiales, garantía y atención del mismo doctor. Cierra con invitación a valoración sin compromiso.',
              max_lines: 4,
            },
            next: null,
          },
        },
      }
    },
  },

  // ── 11. Captura completa de datos ────────────────────
  {
    key: 'data_capture',
    name: 'Captura completa de datos',
    description: 'Cuando el paciente acepta agendar, pide los datos formales en orden.',
    emoji: '📋',
    priority: 75,
    build: () => {
      const t = id('trg', 1)
      const a1 = id('act', 1)
      const a2 = id('act', 2)
      const a3 = id('act', 3)
      return {
        trigger: { id: t, type: 'intent_detected', params: { intent: 'confirmation' }, next: a1 },
        blocks: {
          [a1]: {
            id: a1, kind: 'action', type: 'request_data',
            params: { fields: ['nombre', 'apellido', 'telefono', 'motivo'] },
            next: a2,
          },
          [a2]: { id: a2, kind: 'action', type: 'confirm_appointment', params: {}, next: a3 },
          [a3]: { id: a3, kind: 'action', type: 'set_stage', params: { stage: 'scheduled' }, next: null },
        },
      }
    },
  },

  // ── 12. Pivote (paciente se desvía) ──────────────────
  {
    key: 'pivot_off_topic',
    name: 'Pivote · paciente se desvió',
    description: 'Si pregunta algo fuera del objetivo, responde breve y vuelve a la cita.',
    emoji: '↩️',
    priority: 25,
    build: () => {
      const t = id('trg', 1)
      const c1 = id('cnd', 1)
      const a1 = id('act', 1)
      return {
        trigger: { id: t, type: 'intent_detected', params: { intent: 'info' }, next: c1 },
        blocks: {
          [c1]: {
            id: c1, kind: 'condition', type: 'has_appointment', params: {},
            next: null, next_else: a1,
          },
          [a1]: { id: a1, kind: 'action', type: 'pivot_back_to_goal', params: { brief_answer: '' }, next: null },
        },
      }
    },
  },

  // ── 13. Urgencia clínica (síntomas críticos) ─────────
  {
    key: 'clinical_emergency',
    name: 'Urgencia clínica · atención inmediata',
    description: 'Síntomas críticos: empatía, prioridad máxima y propuesta inmediata.',
    emoji: '🆘',
    priority: 100,
    build: () => {
      const t = id('trg', 1)
      const a1 = id('act', 1)
      const a2 = id('act', 2)
      const a3 = id('act', 3)
      const a4 = id('act', 4)
      return {
        trigger: {
          id: t, type: 'keyword_match',
          params: { keywords: ['no aguanto', 'sangra mucho', 'absceso', 'hinchazón', 'fiebre', 'no puedo dormir del dolor', 'trago saliva con sangre', 'me golpeé', 'se me cayó'] },
          next: a1,
        },
        blocks: {
          [a1]: { id: a1, kind: 'action', type: 'set_urgency', params: { level: 'emergency' }, next: a2 },
          [a2]: { id: a2, kind: 'action', type: 'tag_lead', params: { tag: 'urgencia_clinica' }, next: a3 },
          [a3]: { id: a3, kind: 'action', type: 'propose_slots', params: { duration_minutes: 30 }, next: a4 },
          [a4]: { id: a4, kind: 'action', type: 'escalate_to_human', params: { reason: 'urgencia clínica detectada' }, next: null },
        },
      }
    },
  },
]
