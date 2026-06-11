-- ============================================================
--  CELURA · Migración 008
--  Email log: auditoría de cada email transaccional enviado.
-- ============================================================
--  Cada llamada al mailer escribe una fila en email_log.
--  Sirve para:
--    • Debug ("¿por qué no le llegó el welcome?")
--    • Métricas en el panel admin ("emails enviados últimas 24h")
--    • Anti-spam ("no enviar más de N por hora a la misma dirección")
--    • Re-envío manual desde admin
--
--  No requiere RLS para usuarios finales (solo lo lee el panel admin).
--  Es seguro re-ejecutar (IF NOT EXISTS).
-- ============================================================

CREATE TABLE IF NOT EXISTS email_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant (opcional: emails de sistema sin clínica = NULL)
  clinic_id     UUID REFERENCES clinics(id) ON DELETE SET NULL,

  -- A quién va
  to_email      TEXT NOT NULL,
  to_name       TEXT,

  -- Tipo de email (debe coincidir con EmailKind del código TS)
  --   welcome             → bienvenida al crear cl\u00ednica
  --   trial_ending        → trial por vencer (3 días antes)
  --   trial_ended         → trial vencido, pago pendiente
  --   payment_pending     → recordatorio de pago
  --   payment_received    → confirmación de pago
  --   appointment_confirmation → cita confirmada (al paciente)
  --   appointment_reminder_24h → recordatorio 24h antes (al paciente)
  --   wa_connected        → "tu asistente está activa" (al doctor)
  --   wa_disconnected     → WhatsApp se desconectó
  --   daily_summary       → resumen diario al doctor
  --   admin_alert         → alertas a admins
  --   test                → emails de prueba desde el panel
  --   custom              → otros / one-off
  kind          TEXT NOT NULL CHECK (kind IN (
    'welcome',
    'trial_ending',
    'trial_ended',
    'payment_pending',
    'payment_received',
    'appointment_confirmation',
    'appointment_reminder_24h',
    'wa_connected',
    'wa_disconnected',
    'daily_summary',
    'admin_alert',
    'test',
    'custom'
  )),

  -- Asunto rendereado (para grep rápido)
  subject       TEXT NOT NULL,

  -- Estado
  --   queued   → creado pero aún no enviado
  --   sent     → Resend devolvió 200
  --   failed   → error al enviar (ver error)
  --   skipped  → modo dry-run (sin RESEND_API_KEY) o destinatario inválido
  --   bounced  → marcado por webhook de Resend (fase 2)
  status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'sent', 'failed', 'skipped', 'bounced'
  )),

  -- ID que devuelve Resend (para correlacionar con su dashboard)
  provider_id   TEXT,

  -- Si falló, el mensaje de error
  error         TEXT,

  -- Payload con los datos usados para renderear (debug)
  payload       JSONB DEFAULT '{}'::jsonb,

  -- Tracking
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  sent_at       TIMESTAMPTZ
);

-- Índices para consultas frecuentes del panel admin
CREATE INDEX IF NOT EXISTS idx_email_log_clinic_created
  ON email_log(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_kind_created
  ON email_log(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_status
  ON email_log(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_to_created
  ON email_log(to_email, created_at DESC);

-- RLS: bloqueado para usuarios finales; el panel admin usa service_role
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- Sin policies ⇒ nadie con anon/authenticated lee esta tabla.
-- El service_role ignora RLS por diseño de Supabase.

COMMENT ON TABLE email_log IS
  'Auditoría de cada email transaccional enviado por la API. Solo lectura desde service_role.';
