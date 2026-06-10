// ============================================================
//  CELURA · Tipos centrales de la aplicación
// ============================================================

export type Plan = 'trial' | 'esencial' | 'pro' | 'clinica'
export type ClinicStatus = 'active' | 'suspended' | 'cancelled' | 'trial'
export type LeadStage = 'new' | 'contacted' | 'warm' | 'interested' | 'scheduled' | 'attended' | 'recurring' | 'lost'
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'emergency'
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'attended' | 'no_show' | 'cancelled' | 'rescheduled'
export type FollowUpType = 'pre_appt_24h' | 'pre_appt_2h' | 'post_appt_1h' | 'post_appt_review' | 'cold_7d' | 'cold_14d' | 'cold_30d' | 'reactivation' | 'custom'
export type Tone = 'formal' | 'warm' | 'direct'

// ── Clinic (tenant raíz) ──────────────────────────────────
export interface Clinic {
  id: string
  owner_id: string
  name: string
  slug: string
  phone: string | null
  city: string | null
  country: string
  plan: Plan
  status: ClinicStatus
  trial_ends_at: string | null
  created_at: string
  updated_at: string
}

// ── Clinic config (configuración del asistente) ───────────
export interface ClinicConfig {
  id: string
  clinic_id: string
  assistant_name: string
  tone: Tone
  greeting: string
  farewell: string
  treatments: string[]
  schedule: WeeklySchedule
  custom_prompt: string
  escalate_on: string[]
  claude_key_enc: string | null
  elevenlabs_key_enc: string | null
  wa_connected: boolean
  wa_phone: string | null
  wa_connected_at: string | null
  vision_enabled: boolean
  vision_sensitivity: 'conservative' | 'balanced' | 'thorough'
  vision_focus: string[]
  vision_auto_suggest: boolean
  vision_disclaimer: string
  created_at: string
  updated_at: string
}

export interface VisionFinding {
  area: string                    // 'caries', 'sarro', 'encias', etc
  severity: 'leve' | 'moderado' | 'severo'
  location: string                // 'molar superior derecho', 'incisivos', etc
  confidence: number              // 0-1
  observation: string             // descripción clínica corta
}

export interface VisionAnalysis {
  image_quality: 'baja' | 'aceptable' | 'buena'
  findings: VisionFinding[]
  overall_state: 'sano' | 'requiere_atencion' | 'urgente'
  recommended_treatments: string[]
  patient_message: string         // mensaje empático listo para enviar al paciente
  needs_consultation: boolean
  analyzed_at: string
}

export interface WeeklySchedule {
  mon: string | null  // "08:00-18:00" o null si no atiende
  tue: string | null
  wed: string | null
  thu: string | null
  fri: string | null
  sat: string | null
  sun: string | null
}

// ── Lead ─────────────────────────────────────────────────
export interface Lead {
  id: string
  clinic_id: string
  name: string | null
  phone: string
  phone_wa_id: string | null
  email: string | null
  city: string | null
  stage: LeadStage
  score: number
  treatment_interest: string | null
  urgency_level: UrgencyLevel
  source: string
  notes: string | null
  last_message_at: string | null
  first_contact_at: string
  created_at: string
  updated_at: string
}

// ── Conversation ──────────────────────────────────────────
export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  type: 'text' | 'image' | 'audio' | 'document'
  media_url?: string       // si es imagen o audio
  analyzed?: boolean       // si ya fue analizado por visión IA
}

export interface ConversationContext {
  last_intent?: string            // 'schedule' | 'price' | 'info' | 'emergency' | 'other'
  appointment_discussed?: boolean
  price_asked?: boolean
  photo_sent?: boolean
  photo_analysis?: string         // resultado del análisis de foto (legacy / resumen corto)
  vision_history?: VisionAnalysis[]  // análisis estructurados por Claude Vision
  name_captured?: boolean
  preferred_schedule?: string
  quoted_price?: number
  escalated?: boolean
}

export interface Conversation {
  id: string
  clinic_id: string
  lead_id: string
  messages: Message[]
  context: ConversationContext
  total_tokens: number
  created_at: string
  updated_at: string
}

// ── Appointment ───────────────────────────────────────────
export interface Appointment {
  id: string
  clinic_id: string
  lead_id: string
  scheduled_at: string
  duration_min: number
  treatment: string | null
  status: AppointmentStatus
  notes: string | null
  reminder_24h_sent: boolean
  reminder_2h_sent: boolean
  post_visit_sent: boolean
  created_at: string
  updated_at: string
}

// ── FollowUp ──────────────────────────────────────────────
export interface FollowUp {
  id: string
  clinic_id: string
  lead_id: string
  appointment_id: string | null
  type: FollowUpType
  scheduled_at: string
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  bull_job_id: string | null
  message_preview: string | null
  sent_at: string | null
  error_msg: string | null
  created_at: string
}

// ── Contexto del tenant en cada request ──────────────────
export interface TenantContext {
  clinic_id: string
  owner_id: string
  clinic: Clinic
  config: ClinicConfig
  plan: Plan
}

// ── Payload de mensaje entrante de WhatsApp ───────────────
export interface IncomingWAMessage {
  clinic_id: string
  from_phone: string        // número del paciente normalizado
  wa_jid: string            // jid interno de WhatsApp
  content: string           // texto del mensaje
  type: 'text' | 'image' | 'audio' | 'document'
  media_url?: string
  media_mimetype?: string
  media_data?: string       // base64 cuando es imagen descargada por Baileys
  timestamp: number         // unix timestamp
}

// ── Workflows (motor visual de configuración del asistente) ──

export type TriggerType =
  | 'message_received'      // cualquier mensaje entrante
  | 'new_patient'           // primer mensaje de este lead
  | 'keyword_match'         // contiene palabras clave (params: { keywords: string[] })
  | 'intent_detected'       // intent matchea (params: { intent: 'schedule'|'price'|'emergency'|'info'|'confirmation' })
  | 'photo_received'        // paciente envió imagen
  | 'urgency_level'         // urgencia detectada >= X (params: { min: UrgencyLevel })
  | 'lead_score_above'      // score cruzó umbral (params: { threshold: number })

export type ConditionType =
  | 'is_business_hours'     // según schedule de la clínica
  | 'has_appointment'       // lead tiene cita activa
  | 'urgency_is'            // params: { level: UrgencyLevel }
  | 'score_above'           // params: { threshold: number }
  | 'stage_is'              // params: { stage: LeadStage }
  | 'message_contains'      // params: { text: string[] }
  | 'name_known'            // tenemos nombre del paciente
  | 'photo_finding'         // último análisis Vision tiene hallazgo (params: { area: string, min_severity: 'leve'|'moderado'|'severo' })

export type ActionType =
  | 'send_message'          // params: { text: string } — soporta {{name}}, {{clinic}}
  | 'ai_respond'            // params: { instructions: string, max_lines?: number } — delega a Claude con restricciones
  | 'ask_qualifying'        // params: { question: string, save_to?: 'name'|'treatment_interest'|'city' }
  | 'request_photo'         // params: { reason: string }
  | 'analyze_photo'         // ejecuta Vision (no-op si vision_enabled=false)
  | 'offer_appointment'     // params: { treatment?: string }
  | 'quote_price'           // params: { treatment: string, min: number, max: number, currency: string }
  | 'escalate_to_human'     // params: { reason: string } — marca conversación
  | 'set_stage'             // params: { stage: LeadStage }
  | 'set_urgency'           // params: { level: UrgencyLevel }
  | 'schedule_followup'     // params: { minutes: number, message: string }
  | 'tag_lead'              // params: { tag: string }
  | 'end_workflow'          // termina sin más acciones (útil tras una rama)

export interface WorkflowTrigger {
  id: string
  type: TriggerType
  params: Record<string, unknown>
  next: string | null         // id del primer bloque
}

export interface WorkflowConditionBlock {
  id: string
  kind: 'condition'
  type: ConditionType
  params: Record<string, unknown>
  next: string | null         // rama "sí / cumple"
  next_else: string | null    // rama "no"
}

export interface WorkflowActionBlock {
  id: string
  kind: 'action'
  type: ActionType
  params: Record<string, unknown>
  next: string | null
}

export type WorkflowBlock = WorkflowConditionBlock | WorkflowActionBlock

export interface WorkflowGraph {
  trigger: WorkflowTrigger | null
  blocks: Record<string, WorkflowBlock>
}

export interface Workflow {
  id: string
  clinic_id: string
  name: string
  description: string
  enabled: boolean
  priority: number
  graph: WorkflowGraph
  runs_total: number
  runs_matched: number
  last_run_at: string | null
  created_at: string
  updated_at: string
}

// ── Scoring de leads ──────────────────────────────────────
export const SCORE_EVENTS = {
  FIRST_MESSAGE:        5,
  ASKS_PRICE:          10,
  ASKS_AVAILABILITY:   15,
  SENDS_PHOTO:         20,
  MENTIONS_URGENCY:    25,
  ASKS_TO_SCHEDULE:    30,
  RESPONDS_FAST:        5,  // < 5 min entre mensajes
  RETURNS_AFTER_COLD:  15,
} as const
