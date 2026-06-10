// ============================================================
//  CELURA · Catálogo de bloques de workflows
//  Define todos los bloques disponibles, sus campos, defaults
//  y metadata visual. Es la fuente de verdad del editor.
// ============================================================

import type { LucideIcon } from 'lucide-react'
import {
  MessageSquare, UserPlus, Search, Target, Camera, AlertTriangle, TrendingUp,
  Clock, CalendarCheck, Flame, Star, Tag, MessageCircle, CheckCircle2,
  Send, Sparkles, HelpCircle, ImagePlus, Scan, CalendarPlus, DollarSign,
  UserCog, ArrowUpRight, AlarmClock, BookmarkPlus, Square,
} from 'lucide-react'

export type BlockKind = 'trigger' | 'condition' | 'action'

export interface BlockField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'tags' | 'keywords'
  placeholder?: string
  options?: { value: string; label: string }[]
  optional?: boolean
  hint?: string
}

export interface BlockDef {
  type: string
  kind: BlockKind
  label: string
  description: string
  icon: LucideIcon
  color: string             // tailwind tint, e.g. 'lime', 'amber'
  group: string             // sección del picker
  fields: BlockField[]
  defaults: Record<string, unknown>
  summary: (params: Record<string, unknown>) => string  // 1 línea para mostrar en el nodo
}

// ── TRIGGERS ─────────────────────────────────────────────
export const TRIGGERS: BlockDef[] = [
  {
    type: 'message_received',
    kind: 'trigger',
    label: 'Cualquier mensaje',
    description: 'Se activa con cada mensaje entrante',
    icon: MessageSquare,
    color: 'lime',
    group: 'Disparador',
    fields: [],
    defaults: {},
    summary: () => 'Con cada mensaje del paciente',
  },
  {
    type: 'new_patient',
    kind: 'trigger',
    label: 'Paciente nuevo',
    description: 'Primer mensaje de este paciente',
    icon: UserPlus,
    color: 'lime',
    group: 'Disparador',
    fields: [],
    defaults: {},
    summary: () => 'En el primer contacto',
  },
  {
    type: 'keyword_match',
    kind: 'trigger',
    label: 'Palabras clave',
    description: 'El mensaje contiene ciertas palabras',
    icon: Search,
    color: 'lime',
    group: 'Disparador',
    fields: [
      { key: 'keywords', label: 'Palabras', type: 'keywords', placeholder: 'dolor, duele, molestia', hint: 'Separa con comas. Una sola coincidencia activa el flujo.' },
    ],
    defaults: { keywords: [] },
    summary: (p) => {
      const ks = (p['keywords'] as string[]) ?? []
      return ks.length ? `Si menciona: ${ks.slice(0, 3).join(', ')}${ks.length > 3 ? '…' : ''}` : 'Si menciona palabras…'
    },
  },
  {
    type: 'intent_detected',
    kind: 'trigger',
    label: 'Intención detectada',
    description: 'La IA detectó una intención específica',
    icon: Target,
    color: 'lime',
    group: 'Disparador',
    fields: [
      {
        key: 'intent',
        label: 'Intención',
        type: 'select',
        options: [
          { value: 'schedule', label: 'Quiere agendar' },
          { value: 'price', label: 'Pregunta por precio' },
          { value: 'emergency', label: 'Urgencia / dolor' },
          { value: 'info', label: 'Pide información' },
          { value: 'confirmation', label: 'Confirma / agradece' },
        ],
      },
    ],
    defaults: { intent: 'schedule' },
    summary: (p) => `Si la intención es: ${p['intent'] ?? '—'}`,
  },
  {
    type: 'photo_received',
    kind: 'trigger',
    label: 'Envía una foto',
    description: 'Paciente mandó una imagen',
    icon: Camera,
    color: 'lime',
    group: 'Disparador',
    fields: [],
    defaults: {},
    summary: () => 'Cuando envía una foto',
  },
  {
    type: 'urgency_level',
    kind: 'trigger',
    label: 'Urgencia detectada',
    description: 'Nivel de urgencia ≥ umbral',
    icon: AlertTriangle,
    color: 'lime',
    group: 'Disparador',
    fields: [
      {
        key: 'min',
        label: 'Nivel mínimo',
        type: 'select',
        options: [
          { value: 'medium', label: 'Media' },
          { value: 'high', label: 'Alta' },
          { value: 'emergency', label: 'Emergencia' },
        ],
      },
    ],
    defaults: { min: 'high' },
    summary: (p) => `Urgencia ≥ ${p['min'] ?? 'alta'}`,
  },
  {
    type: 'lead_score_above',
    kind: 'trigger',
    label: 'Score supera umbral',
    description: 'Interés cruza un puntaje',
    icon: TrendingUp,
    color: 'lime',
    group: 'Disparador',
    fields: [
      { key: 'threshold', label: 'Umbral', type: 'number', placeholder: '50' },
    ],
    defaults: { threshold: 50 },
    summary: (p) => `Score ≥ ${p['threshold'] ?? 50}`,
  },
]

// ── CONDITIONS ───────────────────────────────────────────
export const CONDITIONS: BlockDef[] = [
  {
    type: 'is_business_hours',
    kind: 'condition',
    label: 'En horario laboral',
    description: 'Ahora estamos abiertos',
    icon: Clock,
    color: 'amber',
    group: 'Condición',
    fields: [],
    defaults: {},
    summary: () => '¿Estamos en horario?',
  },
  {
    type: 'has_appointment',
    kind: 'condition',
    label: 'Ya tiene cita',
    description: 'El paciente tiene cita agendada',
    icon: CalendarCheck,
    color: 'amber',
    group: 'Condición',
    fields: [],
    defaults: {},
    summary: () => '¿Tiene cita activa?',
  },
  {
    type: 'urgency_is',
    kind: 'condition',
    label: 'Urgencia es',
    description: 'Nivel de urgencia específico',
    icon: Flame,
    color: 'amber',
    group: 'Condición',
    fields: [
      {
        key: 'level',
        label: 'Nivel',
        type: 'select',
        options: [
          { value: 'low', label: 'Baja' },
          { value: 'medium', label: 'Media' },
          { value: 'high', label: 'Alta' },
          { value: 'emergency', label: 'Emergencia' },
        ],
      },
    ],
    defaults: { level: 'high' },
    summary: (p) => `¿Urgencia = ${p['level'] ?? 'alta'}?`,
  },
  {
    type: 'score_above',
    kind: 'condition',
    label: 'Score mayor a',
    description: 'Puntaje del lead supera umbral',
    icon: Star,
    color: 'amber',
    group: 'Condición',
    fields: [
      { key: 'threshold', label: 'Umbral', type: 'number', placeholder: '30' },
    ],
    defaults: { threshold: 30 },
    summary: (p) => `¿Score ≥ ${p['threshold'] ?? 30}?`,
  },
  {
    type: 'stage_is',
    kind: 'condition',
    label: 'Etapa del lead',
    description: 'El lead está en cierta etapa',
    icon: Tag,
    color: 'amber',
    group: 'Condición',
    fields: [
      {
        key: 'stage',
        label: 'Etapa',
        type: 'select',
        options: [
          { value: 'new', label: 'Nuevo' },
          { value: 'contacted', label: 'Contactado' },
          { value: 'warm', label: 'Tibio' },
          { value: 'interested', label: 'Interesado' },
          { value: 'scheduled', label: 'Agendado' },
          { value: 'attended', label: 'Atendido' },
          { value: 'recurring', label: 'Recurrente' },
          { value: 'lost', label: 'Perdido' },
        ],
      },
    ],
    defaults: { stage: 'interested' },
    summary: (p) => `¿Etapa = ${p['stage'] ?? 'interesado'}?`,
  },
  {
    type: 'message_contains',
    kind: 'condition',
    label: 'Mensaje contiene',
    description: 'El texto incluye palabras',
    icon: MessageCircle,
    color: 'amber',
    group: 'Condición',
    fields: [
      { key: 'text', label: 'Palabras', type: 'keywords', placeholder: 'precio, costo' },
    ],
    defaults: { text: [] },
    summary: (p) => {
      const t = (p['text'] as string[]) ?? []
      return t.length ? `¿Dice: ${t.slice(0, 2).join(', ')}…?` : '¿Dice estas palabras?'
    },
  },
  {
    type: 'name_known',
    kind: 'condition',
    label: 'Nombre conocido',
    description: 'Sabemos su nombre',
    icon: CheckCircle2,
    color: 'amber',
    group: 'Condición',
    fields: [],
    defaults: {},
    summary: () => '¿Conocemos su nombre?',
  },
  {
    type: 'photo_finding',
    kind: 'condition',
    label: 'Hallazgo en foto',
    description: 'El análisis Vision detectó algo',
    icon: Scan,
    color: 'amber',
    group: 'Condición',
    fields: [
      {
        key: 'area',
        label: 'Área',
        type: 'select',
        optional: true,
        options: [
          { value: '', label: 'Cualquiera' },
          { value: 'caries', label: 'Caries' },
          { value: 'sarro', label: 'Sarro' },
          { value: 'encias', label: 'Encías' },
          { value: 'desgaste', label: 'Desgaste' },
          { value: 'fracturas', label: 'Fracturas' },
          { value: 'protesis', label: 'Prótesis' },
          { value: 'ortodoncia', label: 'Ortodoncia' },
        ],
      },
      {
        key: 'min_severity',
        label: 'Severidad mínima',
        type: 'select',
        options: [
          { value: 'leve', label: 'Leve' },
          { value: 'moderado', label: 'Moderado' },
          { value: 'severo', label: 'Severo' },
        ],
      },
    ],
    defaults: { area: '', min_severity: 'moderado' },
    summary: (p) => `¿Vision halló ${p['area'] || 'algo'} ≥ ${p['min_severity'] ?? 'moderado'}?`,
  },
]

// ── ACTIONS ──────────────────────────────────────────────
export const ACTIONS: BlockDef[] = [
  {
    type: 'send_message',
    kind: 'action',
    label: 'Enviar mensaje',
    description: 'Responde con un texto fijo',
    icon: Send,
    color: 'sky',
    group: 'Comunicación',
    fields: [
      {
        key: 'text',
        label: 'Mensaje',
        type: 'textarea',
        placeholder: 'Hola {{name}}, soy {{assistant}} de la clínica…',
        hint: 'Puedes usar {{name}}, {{assistant}} y {{clinic}} como variables.',
      },
    ],
    defaults: { text: '' },
    summary: (p) => {
      const t = (p['text'] as string) ?? ''
      return t ? `“${t.slice(0, 38)}${t.length > 38 ? '…' : ''}”` : 'Mensaje sin texto'
    },
  },
  {
    type: 'ai_respond',
    kind: 'action',
    label: 'Responder con IA',
    description: 'Claude redacta siguiendo tus instrucciones',
    icon: Sparkles,
    color: 'sky',
    group: 'Comunicación',
    fields: [
      {
        key: 'instructions',
        label: 'Instrucciones',
        type: 'textarea',
        placeholder: 'Responde con empatía. Reconoce el dolor, ofrece atención prioritaria hoy.',
        hint: 'La IA seguirá estas reglas para esta respuesta.',
      },
      { key: 'max_lines', label: 'Líneas máx.', type: 'number', placeholder: '3', optional: true },
    ],
    defaults: { instructions: '', max_lines: 3 },
    summary: (p) => {
      const i = (p['instructions'] as string) ?? ''
      return i ? `IA: ${i.slice(0, 36)}…` : 'IA con instrucciones'
    },
  },
  {
    type: 'ask_qualifying',
    kind: 'action',
    label: 'Pregunta de calificación',
    description: 'Hace una pregunta para conocer al paciente',
    icon: HelpCircle,
    color: 'sky',
    group: 'Comunicación',
    fields: [
      { key: 'question', label: 'Pregunta', type: 'textarea', placeholder: '¿Cómo te llamas?' },
      {
        key: 'save_to',
        label: 'Guardar respuesta en',
        type: 'select',
        optional: true,
        options: [
          { value: '', label: 'No guardar' },
          { value: 'name', label: 'Nombre' },
          { value: 'treatment_interest', label: 'Tratamiento de interés' },
          { value: 'city', label: 'Ciudad' },
        ],
      },
    ],
    defaults: { question: '', save_to: '' },
    summary: (p) => {
      const q = (p['question'] as string) ?? ''
      return q ? `Pregunta: “${q.slice(0, 30)}…”` : 'Pregunta calificadora'
    },
  },
  {
    type: 'request_photo',
    kind: 'action',
    label: 'Pedir foto',
    description: 'Solicita imagen al paciente',
    icon: ImagePlus,
    color: 'sky',
    group: 'Comunicación',
    fields: [
      { key: 'reason', label: 'Motivo', type: 'textarea', placeholder: '¿Podrías enviarme una foto del diente que te molesta?' },
    ],
    defaults: { reason: '¿Podrías enviarme una foto para verlo mejor?' },
    summary: () => 'Pide una foto',
  },
  {
    type: 'analyze_photo',
    kind: 'action',
    label: 'Analizar foto',
    description: 'Ejecuta análisis clínico Vision',
    icon: Scan,
    color: 'sky',
    group: 'Clínico',
    fields: [],
    defaults: {},
    summary: () => 'Analiza la última foto',
  },
  {
    type: 'offer_appointment',
    kind: 'action',
    label: 'Ofrecer cita',
    description: 'Invita a agendar valoración',
    icon: CalendarPlus,
    color: 'sky',
    group: 'Conversión',
    fields: [
      { key: 'treatment', label: 'Tratamiento', type: 'text', placeholder: 'limpieza dental', optional: true },
    ],
    defaults: { treatment: '' },
    summary: (p) => p['treatment'] ? `Ofrece cita para ${p['treatment']}` : 'Ofrece valoración',
  },
  {
    type: 'quote_price',
    kind: 'action',
    label: 'Cotizar rango',
    description: 'Da rango de precio orientativo',
    icon: DollarSign,
    color: 'sky',
    group: 'Conversión',
    fields: [
      { key: 'treatment', label: 'Tratamiento', type: 'text', placeholder: 'blanqueamiento' },
      { key: 'min', label: 'Mínimo', type: 'number', placeholder: '100' },
      { key: 'max', label: 'Máximo', type: 'number', placeholder: '180' },
      { key: 'currency', label: 'Moneda', type: 'text', placeholder: 'USD' },
    ],
    defaults: { treatment: '', min: 0, max: 0, currency: 'USD' },
    summary: (p) => `${p['treatment'] || 'Cotiza'}: ${p['currency'] ?? 'USD'} ${p['min']}–${p['max']}`,
  },
  {
    type: 'set_stage',
    kind: 'action',
    label: 'Cambiar etapa',
    description: 'Mueve el lead a otra etapa del CRM',
    icon: Tag,
    color: 'violet',
    group: 'CRM',
    fields: [
      {
        key: 'stage',
        label: 'Nueva etapa',
        type: 'select',
        options: [
          { value: 'contacted', label: 'Contactado' },
          { value: 'warm', label: 'Tibio' },
          { value: 'interested', label: 'Interesado' },
          { value: 'scheduled', label: 'Agendado' },
          { value: 'lost', label: 'Perdido' },
        ],
      },
    ],
    defaults: { stage: 'interested' },
    summary: (p) => `→ etapa ${p['stage'] ?? '—'}`,
  },
  {
    type: 'set_urgency',
    kind: 'action',
    label: 'Cambiar urgencia',
    description: 'Eleva o baja el nivel de urgencia',
    icon: AlertTriangle,
    color: 'violet',
    group: 'CRM',
    fields: [
      {
        key: 'level',
        label: 'Nivel',
        type: 'select',
        options: [
          { value: 'low', label: 'Baja' },
          { value: 'medium', label: 'Media' },
          { value: 'high', label: 'Alta' },
          { value: 'emergency', label: 'Emergencia' },
        ],
      },
    ],
    defaults: { level: 'high' },
    summary: (p) => `→ urgencia ${p['level'] ?? '—'}`,
  },
  {
    type: 'tag_lead',
    kind: 'action',
    label: 'Etiquetar lead',
    description: 'Añade una etiqueta al paciente',
    icon: BookmarkPlus,
    color: 'violet',
    group: 'CRM',
    fields: [
      { key: 'tag', label: 'Etiqueta', type: 'text', placeholder: 'VIP, dolor agudo, recurrente…' },
    ],
    defaults: { tag: '' },
    summary: (p) => `Etiqueta: ${p['tag'] || '—'}`,
  },
  {
    type: 'escalate_to_human',
    kind: 'action',
    label: 'Escalar a humano',
    description: 'Pasa la conversación a un doctor real',
    icon: ArrowUpRight,
    color: 'rose',
    group: 'Escalamiento',
    fields: [
      { key: 'reason', label: 'Motivo', type: 'text', placeholder: 'Urgencia médica' },
    ],
    defaults: { reason: '' },
    summary: (p) => `Escalar (${p['reason'] || 'sin motivo'})`,
  },
  {
    type: 'schedule_followup',
    kind: 'action',
    label: 'Programar seguimiento',
    description: 'Reescribe al paciente más tarde',
    icon: AlarmClock,
    color: 'violet',
    group: 'Seguimiento',
    fields: [
      { key: 'minutes', label: 'En cuántos minutos', type: 'number', placeholder: '60' },
      { key: 'message', label: 'Mensaje', type: 'textarea', placeholder: 'Hola {{name}}, ¿cómo te fue?' },
    ],
    defaults: { minutes: 60, message: '' },
    summary: (p) => `Seguimiento en ${p['minutes'] ?? 0} min`,
  },
  {
    type: 'end_workflow',
    kind: 'action',
    label: 'Terminar flujo',
    description: 'Detiene el workflow aquí',
    icon: Square,
    color: 'zinc',
    group: 'Control',
    fields: [],
    defaults: {},
    summary: () => 'Fin del flujo',
  },
]

export const ALL_BLOCKS: BlockDef[] = [...TRIGGERS, ...CONDITIONS, ...ACTIONS]

export function blockDef(type: string): BlockDef | undefined {
  return ALL_BLOCKS.find((b) => b.type === type)
}

export const COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  lime:   { bg: 'bg-lime-500/[0.08]',   border: 'border-lime-500/30',   text: 'text-lime-300',   iconBg: 'bg-lime-500/20' },
  amber:  { bg: 'bg-amber-500/[0.08]',  border: 'border-amber-500/30',  text: 'text-amber-300',  iconBg: 'bg-amber-500/20' },
  sky:    { bg: 'bg-sky-500/[0.08]',    border: 'border-sky-500/30',    text: 'text-sky-300',    iconBg: 'bg-sky-500/20' },
  violet: { bg: 'bg-violet-500/[0.08]', border: 'border-violet-500/30', text: 'text-violet-300', iconBg: 'bg-violet-500/20' },
  rose:   { bg: 'bg-rose-500/[0.08]',   border: 'border-rose-500/30',   text: 'text-rose-300',   iconBg: 'bg-rose-500/20' },
  zinc:   { bg: 'bg-zinc-500/[0.08]',   border: 'border-zinc-500/30',   text: 'text-zinc-300',   iconBg: 'bg-zinc-500/20' },
}
