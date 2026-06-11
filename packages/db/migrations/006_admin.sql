-- ============================================================
--  CELURA · Migration 006 · Panel de administración 360°
--  ------------------------------------------------------------
--  Crea las tablas y vistas que necesita el panel admin para
--  controlar TODO el sistema multi-tenant:
--    • admins       — quién puede acceder al panel
--    • announcements — anuncios globales (mantenimiento, promos)
--    • announcement_dismissals — qué usuario descartó cada uno
--    • clinic_blocks — bloqueos manuales con motivo y duración
--    • admin_logs   — auditoría de TODO lo que hace cada admin
--
--  + Vista admin_clinic_overview con stats agregadas por clínica.
--
--  Después de ejecutar esta migration, inserta tu user_id como
--  primer superadmin (es la única forma de entrar al panel):
--
--    INSERT INTO admins (user_id, role)
--    VALUES ('<TU_UUID_EN_AUTH.USERS>', 'superadmin');
-- ============================================================

-- ── 1. Tabla admins ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'admin'
                CHECK (role IN ('admin', 'superadmin')),
  -- Notas internas opcionales (para tu propio registro)
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Solo otros admins pueden ver la tabla (vía service_role en backend).
-- Frontend nunca lee admins directamente — siempre vía API con verificación.
CREATE POLICY "admins: solo admins ven admins"
  ON admins FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM admins));

-- ── 2. Helper para verificar admin desde SQL ─────────────
CREATE OR REPLACE FUNCTION is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = p_user_id);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── 3. Tabla announcements ───────────────────────────────
-- Anuncios globales mostrados a los doctores en el dashboard.
-- Tipos: info | warning | success | promo | maintenance
-- Audiencia: all | trial | paid | beta | specific (lista de clinic_ids)
CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info','warning','success','promo','maintenance')),
  audience    TEXT NOT NULL DEFAULT 'all'
                CHECK (audience IN ('all','trial','paid','beta','specific')),
  -- Si audience='specific', lista de clinic_ids permitidos
  audience_ids UUID[] DEFAULT NULL,

  -- CTA opcional (texto + link)
  cta_label   TEXT,
  cta_url     TEXT,

  -- Ventana de vigencia
  starts_at   TIMESTAMPTZ DEFAULT NOW(),
  ends_at     TIMESTAMPTZ,

  -- ¿El usuario puede descartarlo? (true=banner cerrable; false=permanente)
  dismissible BOOLEAN NOT NULL DEFAULT TRUE,

  -- On/off rápido sin borrar
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,

  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active
  ON announcements(is_active, starts_at, ends_at);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado ve anuncios activos.
-- El backend filtra por audiencia (audience='all', plan, etc.) antes de devolver.
CREATE POLICY "announcements: lectura para autenticados"
  ON announcements FOR SELECT
  USING (auth.role() = 'authenticated');

-- Escritura: solo admins.
CREATE POLICY "announcements: solo admins escriben"
  ON announcements FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── 4. Tabla announcement_dismissals ─────────────────────
-- Qué usuario descartó qué anuncio (para no volver a mostrarlo).
CREATE TABLE IF NOT EXISTS announcement_dismissals (
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_id  UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  dismissed_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, announcement_id)
);

ALTER TABLE announcement_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dismissals: cada usuario gestiona los suyos"
  ON announcement_dismissals FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 5. Tabla clinic_blocks ───────────────────────────────
-- Bloqueos manuales de clínicas con motivo, duración y autor.
-- Es la "historia" de bloqueos; el flag activo vive en clinics.status='suspended'.
CREATE TABLE IF NOT EXISTS clinic_blocks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  blocked_at  TIMESTAMPTZ DEFAULT NOW(),
  blocked_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Null = bloqueo indefinido
  unblock_at  TIMESTAMPTZ,
  unblocked_at TIMESTAMPTZ,
  unblocked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_clinic_blocks_clinic
  ON clinic_blocks(clinic_id, blocked_at DESC);

ALTER TABLE clinic_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_blocks: solo admins"
  ON clinic_blocks FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── 6. Tabla admin_logs ──────────────────────────────────
-- Auditoría completa: cada acción de cada admin queda registrada.
-- Inmutable desde el frontend (solo INSERT). target_type es libre
-- ('clinic','user','announcement','plan',...) para flexibilidad.
CREATE TABLE IF NOT EXISTS admin_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  payload       JSONB DEFAULT '{}',
  ip            TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_created
  ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin
  ON admin_logs(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target
  ON admin_logs(target_type, target_id, created_at DESC);

ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_logs: solo admins ven logs"
  ON admin_logs FOR SELECT
  USING (is_admin());

-- INSERT lo hacen los endpoints del backend con service_role (sin RLS).
-- No exponemos UPDATE/DELETE para mantener inmutabilidad.

-- ── 7. Trigger updated_at en announcements ───────────────
CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ── 8. Vista admin_clinic_overview ───────────────────────
-- Vista materializada-en-vivo (no materialized) con stats por clínica
-- para listar el panel admin sin hacer N+1 queries.
CREATE OR REPLACE VIEW admin_clinic_overview AS
SELECT
  c.id                AS clinic_id,
  c.name              AS clinic_name,
  c.slug,
  c.owner_id,
  c.plan,
  c.status,
  c.is_beta,
  c.country,
  c.city,
  c.trial_ends_at,
  c.created_at,
  cc.wa_connected,
  cc.wa_phone,
  cc.wa_connected_at,
  cc.ai_provider,
  -- Llave en la nube: ¿tiene API key configurada de su provider?
  CASE
    WHEN cc.ai_provider = 'openai' AND cc.openai_key_enc IS NOT NULL THEN TRUE
    WHEN cc.ai_provider = 'claude' AND cc.claude_key_enc IS NOT NULL THEN TRUE
    WHEN cc.ai_provider IS NULL AND cc.claude_key_enc IS NOT NULL THEN TRUE
    ELSE FALSE
  END AS has_ai_key,
  -- Conteos (subquery por clinic_id; viene de tablas con índice por clinic_id)
  (SELECT COUNT(*) FROM leads l WHERE l.clinic_id = c.id) AS leads_total,
  (SELECT COUNT(*) FROM leads l WHERE l.clinic_id = c.id
     AND l.last_message_at > NOW() - INTERVAL '7 days') AS leads_7d,
  (SELECT COUNT(*) FROM appointments a WHERE a.clinic_id = c.id
     AND a.status IN ('scheduled','confirmed')) AS appts_upcoming,
  (SELECT COUNT(*) FROM appointments a WHERE a.clinic_id = c.id
     AND a.status = 'attended') AS appts_attended,
  (SELECT COALESCE(SUM(total_tokens), 0) FROM conversations conv
     WHERE conv.clinic_id = c.id) AS tokens_total,
  -- Último contacto del paciente más reciente
  (SELECT MAX(last_message_at) FROM leads l WHERE l.clinic_id = c.id) AS last_lead_activity
FROM clinics c
LEFT JOIN clinic_config cc ON cc.clinic_id = c.id;

-- ── 9. Función: extender trial N días ────────────────────
CREATE OR REPLACE FUNCTION admin_extend_trial(
  p_clinic_id UUID,
  p_days INT
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_new_end TIMESTAMPTZ;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE clinics
  SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, NOW()), NOW()) + (p_days || ' days')::INTERVAL,
      updated_at = NOW()
  WHERE id = p_clinic_id
  RETURNING trial_ends_at INTO v_new_end;

  RETURN v_new_end;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 10. Comentarios ──────────────────────────────────────
COMMENT ON TABLE admins IS 'Usuarios con acceso al panel admin. El primero se inserta a mano.';
COMMENT ON TABLE announcements IS 'Anuncios globales mostrados como banner a los doctores.';
COMMENT ON TABLE clinic_blocks IS 'Histórico de bloqueos manuales. El flag activo vive en clinics.status.';
COMMENT ON TABLE admin_logs IS 'Auditoría inmutable de cada acción del panel admin.';
