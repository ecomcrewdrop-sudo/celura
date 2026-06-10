// ============================================================
//  CELURA · Tipos compartidos de workflows (frontend)
//  Espejo de los tipos del backend (apps/api/src/types/tenant.ts).
//  Si cambias uno, sincroniza el otro.
// ============================================================

export type TriggerType =
  | 'message_received'
  | 'new_patient'
  | 'keyword_match'
  | 'intent_detected'
  | 'photo_received'
  | 'urgency_level'
  | 'lead_score_above'

export type ConditionType =
  | 'is_business_hours'
  | 'has_appointment'
  | 'urgency_is'
  | 'score_above'
  | 'stage_is'
  | 'message_contains'
  | 'name_known'
  | 'photo_finding'

export type ActionType =
  | 'send_message'
  | 'ai_respond'
  | 'ask_qualifying'
  | 'request_photo'
  | 'analyze_photo'
  | 'offer_appointment'
  | 'quote_price'
  | 'escalate_to_human'
  | 'set_stage'
  | 'set_urgency'
  | 'schedule_followup'
  | 'tag_lead'
  | 'end_workflow'

export interface WorkflowTrigger {
  id: string
  type: TriggerType
  params: Record<string, unknown>
  next: string | null
}

export interface WorkflowConditionBlock {
  id: string
  kind: 'condition'
  type: ConditionType
  params: Record<string, unknown>
  next: string | null
  next_else: string | null
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

export function newBlockId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`
}
