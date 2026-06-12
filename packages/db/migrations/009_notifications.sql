-- ============================================================
--  CELURA · Sistema de notificaciones in-app + preferencias
--  ------------------------------------------------------------
--  Esta migración agrega:
--   1. clinics.timezone — para crons que respetan hora local
--   2. appointments.email_reminder_24h_sent — idempotencia
--   3. notifications — feed de notificaciones por clínica/usuario
--   4. notification_preferences — on/off por kind y canal
--
--  RLS:
--   • notifications: el user solo ve las de su clinic_id (o suyas).
--   • notification_preferences: el user solo ve/edita las suyas.
-- ============================================================

-- ────────────────────────────────────────────────────────
--  1) clinics.timezone
--     IANA TZ name. Default Ciudad de México (la mayoría de
--     clínicas son LATAM). El front lo deja configurar.
-- ────────────────────────────────────────────────────────
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Mexico_City';

COMMENT ON COLUMN clinics.timezone IS
  'IANA timezone (ej: America/Mexico_City, America/Bogota). Usado por crons que respetan hora local de la clínica.';

-- ────────────────────────────────────────────────────────
--  2) appointments.email_reminder_24h_sent
--     Idempotencia del recordatorio por correo. Paralelo al
--     reminder_24h_sent (que es del seguimiento por WhatsApp).
-- ────────────────────────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS email_reminder_24h_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- ────────────────────────────────────────────────────────
--  3) notifications — el feed que ve el doctor en el panel
--     - clinic_id: a qué clínica pertenece (RLS pivot)
--     - user_id: NULL = visible a todos los users de la clínica;
--                set = solo a ese user (ej. preferencias propias)
--     - kind: identificador del evento; mismo set que email_log
--             para tener trazabilidad cruzada, + extras in-app
--     - severity: tono visual (info | success | warning | critical)
--     - entity_type/entity_id: para dedup y deep-link a la entidad
--     - read_at / archived_at: estado del usuario
--     - expires_at: para anuncios que se auto-borran
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id      UUID         REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = toda la clínica

  kind         TEXT         NOT NULL CHECK (kind IN (
                              'welcome',
                              'wa_connected',
                              'wa_disconnected',
                              'appointment_new',
                              'appointment_reminder_24h',
                              'appointment_cancelled',
                              'appointment_rescheduled',
                              'lead_new',
                              'lead_high_value',
                              'message_urgent',
                              'trial_ending',
                              'trial_ended',
                              'payment_pending',
                              'payment_received',
                              'daily_summary',
                              'admin_announcement',
                              'system',
                              'custom'
                            )),
  severity     TEXT         NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','critical')),

  title        TEXT         NOT NULL,
  body         TEXT,
  icon         TEXT,                  -- nombre de Lucide (Calendar, BellRing, etc.)

  action_url   TEXT,
  action_label TEXT,

  entity_type  TEXT,                  -- 'appointment' | 'lead' | 'message' | ...
  entity_id    UUID,                  -- id de la entidad referenciada (para dedup + deep-link)

  metadata     JSONB        NOT NULL DEFAULT '{}'::jsonb,

  read_at      TIMESTAMPTZ,
  archived_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,           -- cuando llegue, queda invisible al feed

  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índices para los queries típicos del front
CREATE INDEX IF NOT EXISTS idx_notif_clinic_created
  ON notifications(clinic_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notif_clinic_unread
  ON notifications(clinic_id, created_at DESC)
  WHERE read_at IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notif_user
  ON notifications(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Dedup: misma entidad + mismo kind no se duplica si aún no leída
CREATE INDEX IF NOT EXISTS idx_notif_dedup
  ON notifications(clinic_id, kind, entity_type, entity_id)
  WHERE entity_id IS NOT NULL AND read_at IS NULL;

-- Soft-expiry: query para "no incluir las expiradas"
CREATE INDEX IF NOT EXISTS idx_notif_expires
  ON notifications(expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON TABLE notifications IS
  'Feed de notificaciones in-app. Persiste para historial; el front filtra por read_at/archived_at/expires_at.';

-- ── RLS ──────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Los users ven las notifs de su clínica (las globales user_id IS NULL)
-- + las suyas personales (user_id = auth.uid()).
CREATE POLICY notif_select_own ON notifications
  FOR SELECT
  USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_id = auth.uid())
    OR user_id = auth.uid()
  );

-- Solo el dueño de la notif o de la clínica puede marcarla leída/archivada
CREATE POLICY notif_update_own ON notifications
  FOR UPDATE
  USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_id = auth.uid())
    OR user_id = auth.uid()
  );

-- INSERT solo desde service_role (la API decide qué notifica)
-- → ninguna policy de INSERT, queda bloqueado para anon/authenticated

-- ────────────────────────────────────────────────────────
--  4) notification_preferences — on/off por kind y canal
--     Una fila por (user_id, kind). Si no existe → defaults:
--      email_enabled = TRUE
--      inapp_enabled = TRUE
--     Excepción: 'message_urgent' y 'lead_high_value' son in-app
--     únicamente por defecto (los emails son ruidosos).
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id        UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind           TEXT         NOT NULL,
  email_enabled  BOOLEAN      NOT NULL DEFAULT TRUE,
  inapp_enabled  BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user
  ON notification_preferences(user_id);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_prefs_select_own ON notification_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY notif_prefs_insert_own ON notification_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY notif_prefs_update_own ON notification_preferences
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY notif_prefs_delete_own ON notification_preferences
  FOR DELETE USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────
--  5) Trigger: bump updated_at en preferences
-- ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bump_notif_prefs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_notif_prefs_updated_at ON notification_preferences;
CREATE TRIGGER trg_notif_prefs_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION bump_notif_prefs_updated_at();

-- ────────────────────────────────────────────────────────
--  6) Realtime: habilitar el canal de notifications
--     Supabase replica vía Postgres logical replication.
-- ────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
