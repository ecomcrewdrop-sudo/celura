-- ============================================================
--  Migration 012 · Configuración de seguimientos / recordatorios
--
--  El doctor podrá tocar TODO desde Settings → Seguimientos:
--    - recordatorios pre/post cita (on/off + tiempos)
--    - cold followups a 7/14/30 días (on/off + tiempos)
--    - reactivación de pacientes inactivos
--    - ventana de horas silenciosas (no enviar de noche)
--    - mensajes IA-generados o plantillas custom por tipo
--
--  Lo metemos en un solo JSONB para no explotar la tabla con 20
--  columnas planas. El backend lee con defaults seguros, así que
--  clínicas viejas siguen funcionando sin tocar nada.
-- ============================================================

ALTER TABLE clinic_config
  ADD COLUMN IF NOT EXISTS followup_config JSONB NOT NULL DEFAULT '{
    "appointment_reminders": {
      "h24_enabled": true,
      "h2_enabled": true,
      "h2_minutes_before": 120,
      "post_visit_enabled": true,
      "post_visit_minutes_after": 60,
      "review_request_enabled": true,
      "review_request_hours_after": 24
    },
    "cold_followups": {
      "d7_enabled": true,  "d7_days": 7,
      "d14_enabled": true, "d14_days": 14,
      "d30_enabled": true, "d30_days": 30
    },
    "reactivation": {
      "enabled": false,
      "months_inactive": 3
    },
    "ai_generated": true,
    "quiet_hours": {
      "enabled": true,
      "from": "21:00",
      "to": "08:00"
    },
    "templates": {
      "pre_appt_24h":      "",
      "pre_appt_2h":       "",
      "post_appt_1h":      "",
      "post_appt_review":  "",
      "cold_7d":           "",
      "cold_14d":          "",
      "cold_30d":          "",
      "reactivation":      ""
    }
  }'::jsonb;

-- Para clínicas que ya existían, normalizamos el valor por si quedó NULL
UPDATE clinic_config
SET followup_config = '{
  "appointment_reminders": {
    "h24_enabled": true,
    "h2_enabled": true,
    "h2_minutes_before": 120,
    "post_visit_enabled": true,
    "post_visit_minutes_after": 60,
    "review_request_enabled": true,
    "review_request_hours_after": 24
  },
  "cold_followups": {
    "d7_enabled": true,  "d7_days": 7,
    "d14_enabled": true, "d14_days": 14,
    "d30_enabled": true, "d30_days": 30
  },
  "reactivation": {
    "enabled": false,
    "months_inactive": 3
  },
  "ai_generated": true,
  "quiet_hours": {
    "enabled": true,
    "from": "21:00",
    "to": "08:00"
  },
  "templates": {
    "pre_appt_24h":      "",
    "pre_appt_2h":       "",
    "post_appt_1h":      "",
    "post_appt_review":  "",
    "cold_7d":           "",
    "cold_14d":          "",
    "cold_30d":          "",
    "reactivation":      ""
  }
}'::jsonb
WHERE followup_config IS NULL;
