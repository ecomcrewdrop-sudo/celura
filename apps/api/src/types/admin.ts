// ============================================================
//  CELURA · Tipos del panel admin
// ============================================================

export type AdminRole = 'admin' | 'superadmin'

export interface AdminUser {
  user_id: string
  role: AdminRole
  notes: string | null
  created_at: string
  created_by: string | null
}

export type AnnouncementSeverity =
  | 'info'
  | 'warning'
  | 'success'
  | 'promo'
  | 'maintenance'

export type AnnouncementAudience =
  | 'all'
  | 'trial'
  | 'paid'
  | 'beta'
  | 'specific'

export interface Announcement {
  id: string
  title: string
  body: string
  severity: AnnouncementSeverity
  audience: AnnouncementAudience
  audience_ids: string[] | null
  cta_label: string | null
  cta_url: string | null
  starts_at: string | null
  ends_at: string | null
  dismissible: boolean
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ClinicBlock {
  id: string
  clinic_id: string
  reason: string
  blocked_at: string
  blocked_by: string | null
  unblock_at: string | null
  unblocked_at: string | null
  unblocked_by: string | null
  notes: string | null
}

export interface AdminLog {
  id: string
  admin_user_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  payload: Record<string, unknown>
  ip: string | null
  user_agent: string | null
  created_at: string
}

export interface AdminClinicOverview {
  clinic_id: string
  clinic_name: string
  slug: string
  owner_id: string
  plan: 'trial' | 'esencial' | 'pro' | 'clinica'
  status: 'active' | 'suspended' | 'cancelled' | 'trial'
  is_beta: boolean
  country: string | null
  city: string | null
  trial_ends_at: string | null
  created_at: string
  wa_connected: boolean | null
  wa_phone: string | null
  wa_connected_at: string | null
  ai_provider: 'claude' | 'openai' | null
  has_ai_key: boolean
  leads_total: number
  leads_7d: number
  appts_upcoming: number
  appts_attended: number
  tokens_total: number
  last_lead_activity: string | null
}

declare module 'fastify' {
  interface FastifyRequest {
    admin?: {
      user_id: string
      role: AdminRole
    }
  }
}
