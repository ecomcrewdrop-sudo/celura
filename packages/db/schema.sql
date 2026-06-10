-- ============================================================
--  CELURA · Schema completo con Row Level Security
--  Ejecutar en Supabase SQL Editor → Run
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
--  TABLA: clinics
--  La tabla raíz. Un registro = un tenant = una clínica.
-- ============================================================
CREATE TABLE IF NOT EXISTS clinics (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,             -- ej: "clinica-sonrisa-cali"
  phone       TEXT,                             -- número principal de la clínica
  city        TEXT,
  country     TEXT DEFAULT 'CO',
  plan        TEXT NOT NULL DEFAULT 'trial'     -- trial | esencial | pro | clinica
                CHECK (plan IN ('trial','esencial','pro','clinica')),
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','suspended','cancelled','trial')),
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: el owner solo ve su propia clínica
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinics: owner puede ver la suya"
  ON clinics FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "clinics: owner puede actualizar la suya"
  ON clinics FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "clinics: cualquier autenticado puede crear"
  ON clinics FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- ============================================================
--  TABLA: clinic_config
--  Configuración del asistente IA por clínica.
--  API keys encriptadas con pgcrypto antes de guardarse.
-- ============================================================
CREATE TABLE IF NOT EXISTS clinic_config (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id         UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,

  -- Personalidad del asistente
  assistant_name    TEXT NOT NULL DEFAULT 'Asistente',
  tone              TEXT NOT NULL DEFAULT 'warm'
                      CHECK (tone IN ('formal','warm','direct')),
  greeting          TEXT DEFAULT '¡Hola! Bienvenido. ¿En qué te puedo ayudar hoy?',
  farewell          TEXT DEFAULT 'Un placer atenderte. ¡Hasta pronto!',

  -- Tratamientos que maneja la clínica (array de strings)
  treatments        TEXT[] DEFAULT ARRAY['implantes','blanqueamiento','ortodoncia','limpieza'],

  -- Horarios de atención (para escalar a humano fuera de horario)
  schedule          JSONB DEFAULT '{"mon":"08:00-18:00","tue":"08:00-18:00","wed":"08:00-18:00","thu":"08:00-18:00","fri":"08:00-18:00","sat":"08:00-13:00","sun":null}',

  -- Prompt personalizado adicional del doctor
  custom_prompt     TEXT DEFAULT '',

  -- Cuándo escalar a humano
  escalate_on       TEXT[] DEFAULT ARRAY['dolor intenso','urgencia','emergencia'],

  -- API keys encriptadas (AES-256 vía pgcrypto)
  -- Se cifran en el backend con la ENCRYPTION_KEY de env antes de guardar
  claude_key_enc    TEXT,    -- Claude API key encriptada
  elevenlabs_key_enc TEXT,   -- ElevenLabs API key encriptada (fase 2)

  -- WhatsApp session state
  wa_connected      BOOLEAN DEFAULT FALSE,
  wa_phone          TEXT,    -- número conectado, ej: "+573001234567"
  wa_connected_at   TIMESTAMPTZ,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clinic_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_config: solo el owner de la clínica"
  ON clinic_config FOR ALL
  USING (
    clinic_id IN (
      SELECT id FROM clinics WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
--  TABLA: leads
--  Cada paciente/prospecto que contacta la clínica.
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  -- Datos del paciente
  name          TEXT,
  phone         TEXT NOT NULL,       -- número de WhatsApp normalizado
  phone_wa_id   TEXT,                -- ID interno de WhatsApp (jid)
  email         TEXT,
  city          TEXT,

  -- Pipeline
  stage         TEXT NOT NULL DEFAULT 'new'
                  CHECK (stage IN ('new','contacted','warm','interested','scheduled','attended','recurring','lost')),
  score         INT DEFAULT 0 CHECK (score >= 0 AND score <= 100),

  -- Interés detectado por IA
  treatment_interest TEXT,           -- tratamiento que más mencionó
  urgency_level      TEXT DEFAULT 'low' CHECK (urgency_level IN ('low','medium','high','emergency')),
  source             TEXT DEFAULT 'whatsapp',

  -- Notas
  notes         TEXT,

  -- Tracking
  last_message_at   TIMESTAMPTZ,
  first_contact_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  -- Un teléfono único por clínica
  UNIQUE (clinic_id, phone)
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads: solo el owner de la clínica"
  ON leads FOR ALL
  USING (
    clinic_id IN (
      SELECT id FROM clinics WHERE owner_id = auth.uid()
    )
  );

CREATE INDEX idx_leads_clinic_stage ON leads(clinic_id, stage);
CREATE INDEX idx_leads_clinic_phone ON leads(clinic_id, phone);
CREATE INDEX idx_leads_score ON leads(clinic_id, score DESC);

-- ============================================================
--  TABLA: conversations
--  Historial completo de mensajes por lead.
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  -- Mensajes como array JSONB: [{role, content, timestamp, type}]
  -- type: text | image | audio | document
  messages    JSONB NOT NULL DEFAULT '[]',

  -- Contexto que mantiene el asistente sobre este paciente
  -- {last_intent, appointment_discussed, price_asked, photo_sent, etc}
  context     JSONB NOT NULL DEFAULT '{}',

  -- Tokens usados (para mostrar al doctor su consumo)
  total_tokens INT DEFAULT 0,

  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (clinic_id, lead_id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations: solo el owner de la clínica"
  ON conversations FOR ALL
  USING (
    clinic_id IN (
      SELECT id FROM clinics WHERE owner_id = auth.uid()
    )
  );

CREATE INDEX idx_conversations_lead ON conversations(lead_id);
CREATE INDEX idx_conversations_clinic ON conversations(clinic_id);

-- ============================================================
--  TABLA: appointments
--  Citas agendadas.
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  scheduled_at  TIMESTAMPTZ NOT NULL,
  duration_min  INT DEFAULT 60,
  treatment     TEXT,
  status        TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','confirmed','attended','no_show','cancelled','rescheduled')),
  notes         TEXT,
  reminder_24h_sent BOOLEAN DEFAULT FALSE,
  reminder_2h_sent  BOOLEAN DEFAULT FALSE,
  post_visit_sent   BOOLEAN DEFAULT FALSE,

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments: solo el owner de la clínica"
  ON appointments FOR ALL
  USING (
    clinic_id IN (
      SELECT id FROM clinics WHERE owner_id = auth.uid()
    )
  );

CREATE INDEX idx_appointments_clinic_date ON appointments(clinic_id, scheduled_at);
CREATE INDEX idx_appointments_status ON appointments(clinic_id, status);

-- ============================================================
--  TABLA: follow_ups
--  Cola de seguimientos programados.
-- ============================================================
CREATE TABLE IF NOT EXISTS follow_ups (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,

  type          TEXT NOT NULL
                  CHECK (type IN (
                    'pre_appt_24h','pre_appt_2h',
                    'post_appt_1h','post_appt_review',
                    'cold_7d','cold_14d','cold_30d',
                    'reactivation','custom'
                  )),
  scheduled_at  TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed','cancelled')),

  -- ID del job en BullMQ para poder cancelarlo si el lead agenda
  bull_job_id   TEXT,

  -- Mensaje generado por IA (se genera al encolar, no al enviar)
  message_preview TEXT,

  sent_at       TIMESTAMPTZ,
  error_msg     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follow_ups: solo el owner de la clínica"
  ON follow_ups FOR ALL
  USING (
    clinic_id IN (
      SELECT id FROM clinics WHERE owner_id = auth.uid()
    )
  );

CREATE INDEX idx_followups_scheduled ON follow_ups(clinic_id, scheduled_at, status);
CREATE INDEX idx_followups_lead ON follow_ups(lead_id, status);

-- ============================================================
--  TABLA: analytics_daily
--  Snapshot diario de métricas por clínica.
--  Se calcula por un cron job cada noche.
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics_daily (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  date            DATE NOT NULL,

  new_leads       INT DEFAULT 0,
  messages_sent   INT DEFAULT 0,
  messages_recv   INT DEFAULT 0,
  appointments    INT DEFAULT 0,
  no_shows        INT DEFAULT 0,
  reactivations   INT DEFAULT 0,
  tokens_used     INT DEFAULT 0,

  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (clinic_id, date)
);

ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics: solo el owner de la clínica"
  ON analytics_daily FOR ALL
  USING (
    clinic_id IN (
      SELECT id FROM clinics WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
--  FUNCIÓN: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinics_updated_at
  BEFORE UPDATE ON clinics
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trg_clinic_config_updated_at
  BEFORE UPDATE ON clinic_config
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ============================================================
--  FUNCIÓN: auto-crear clinic_config al crear clinic
-- ============================================================
CREATE OR REPLACE FUNCTION create_clinic_config()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO clinic_config (clinic_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_create_clinic_config
  AFTER INSERT ON clinics
  FOR EACH ROW EXECUTE FUNCTION create_clinic_config();

-- ============================================================
--  FUNCIÓN: actualizar lead score automáticamente
--  Se suma puntaje por señales de interés detectadas
-- ============================================================
CREATE OR REPLACE FUNCTION increment_lead_score(
  p_lead_id UUID,
  p_clinic_id UUID,
  p_points INT
)
RETURNS VOID AS $$
BEGIN
  UPDATE leads
  SET score = LEAST(score + p_points, 100),  -- máximo 100
      updated_at = NOW()
  WHERE id = p_lead_id AND clinic_id = p_clinic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
