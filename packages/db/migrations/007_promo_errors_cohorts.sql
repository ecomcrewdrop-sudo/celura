-- ============================================================
--  CELURA · Migración 007
--  Promo codes + Error tracking + Cohort support
-- ============================================================
--  Esta migración añade tres capacidades al panel admin:
--    1. PROMO CODES  · cupones de descuento, extensión de trial
--                      y códigos de afiliados (con comisión).
--    2. ERROR EVENTS · feed de errores agrupados por fingerprint
--                      con contador, primera y última aparición.
--    3. COHORT VIEW  · vista que pre-calcula la actividad mensual
--                      de cada clínica para retención por cohorte.
--
--  No toca tablas existentes. Es seguro re-ejecutar (IF NOT EXISTS).
-- ============================================================

-- ────────────────────────────────────────────────────────
--  1. PROMO CODES
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('discount_pct', 'discount_amount', 'trial_extend', 'plan_upgrade')),
  -- Para discount_pct: 0-100; para discount_amount: monto en currency; para trial_extend: días; para plan_upgrade: ignorado
  value NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  -- Para plan_upgrade: a qué plan upgradeamos. Para descuentos: plan al que aplica (NULL = cualquiera)
  target_plan TEXT,
  -- Planes en los que es válido redimir (NULL = cualquier plan)
  applies_to_plans TEXT[],
  max_redemptions INT,
  redemptions_count INT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Afiliados: si el código pertenece a un partner
  affiliate_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  affiliate_commission_pct NUMERIC,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes (code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_promo_codes_affiliate ON promo_codes (affiliate_user_id) WHERE affiliate_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_kind TEXT NOT NULL,
  applied_value NUMERIC,
  meta JSONB DEFAULT '{}'::JSONB,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una clínica no puede redimir el mismo código dos veces
CREATE UNIQUE INDEX IF NOT EXISTS uniq_promo_redemption_per_clinic
  ON promo_redemptions (promo_code_id, clinic_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_clinic ON promo_redemptions (clinic_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_when ON promo_redemptions (redeemed_at DESC);

-- ────────────────────────────────────────────────────────
--  2. ERROR EVENTS (agrupados por fingerprint)
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS error_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,           -- 'whisper' | 'claude' | 'openai' | 'baileys' | 'fastify' | 'webhook' | 'system'
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('warning', 'error', 'critical')),
  code TEXT,                      -- 'TIMEOUT', 'HTTP_500', 'AUTH_FAILED', 'CONNECTION_LOST'
  title TEXT NOT NULL,            -- mensaje corto, primera línea
  detail TEXT,                    -- mensaje completo o descripción
  stack TEXT,
  clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
  context JSONB DEFAULT '{}'::JSONB,
  occurrences INT NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_events_last_seen ON error_events (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_events_source ON error_events (source);
CREATE INDEX IF NOT EXISTS idx_error_events_severity ON error_events (severity);
CREATE INDEX IF NOT EXISTS idx_error_events_unresolved ON error_events (last_seen_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_error_events_clinic ON error_events (clinic_id) WHERE clinic_id IS NOT NULL;

-- Función helper: upsert por fingerprint, incrementa occurrences
CREATE OR REPLACE FUNCTION track_error_event(
  p_fingerprint TEXT,
  p_source TEXT,
  p_severity TEXT,
  p_code TEXT,
  p_title TEXT,
  p_detail TEXT,
  p_stack TEXT,
  p_clinic_id UUID,
  p_context JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO error_events (
    fingerprint, source, severity, code, title, detail, stack,
    clinic_id, context, first_seen_at, last_seen_at
  )
  VALUES (
    p_fingerprint, p_source, p_severity, p_code, p_title, p_detail, p_stack,
    p_clinic_id, COALESCE(p_context, '{}'::JSONB), NOW(), NOW()
  )
  ON CONFLICT (fingerprint) DO UPDATE
    SET occurrences = error_events.occurrences + 1,
        last_seen_at = NOW(),
        -- Si el error venía resuelto y volvió a aparecer, reabrir
        resolved_at = CASE
          WHEN error_events.resolved_at IS NOT NULL THEN NULL
          ELSE error_events.resolved_at
        END,
        resolved_by = CASE
          WHEN error_events.resolved_at IS NOT NULL THEN NULL
          ELSE error_events.resolved_by
        END,
        -- Mantener el último contexto y stack (más reciente suele ser más útil)
        context = COALESCE(p_context, error_events.context),
        stack = COALESCE(p_stack, error_events.stack),
        detail = COALESCE(p_detail, error_events.detail),
        severity = CASE
          -- Escalar si llega más grave
          WHEN p_severity = 'critical' THEN 'critical'
          WHEN p_severity = 'error' AND error_events.severity = 'warning' THEN 'error'
          ELSE error_events.severity
        END
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ────────────────────────────────────────────────────────
--  3. COHORT VIEW — actividad mensual por clínica
-- ────────────────────────────────────────────────────────
-- Idea: para cada clínica, qué meses tuvo actividad (creó leads).
-- El frontend cruza con created_at (cohorte = mes de signup) y arma la matriz.
CREATE OR REPLACE VIEW admin_clinic_monthly_activity AS
SELECT
  c.id AS clinic_id,
  date_trunc('month', c.created_at)::DATE AS cohort_month,
  date_trunc('month', l.created_at)::DATE AS activity_month,
  COUNT(l.id) AS lead_count
FROM clinics c
LEFT JOIN leads l ON l.clinic_id = c.id
GROUP BY c.id, cohort_month, activity_month;

-- Vista resumen del cohort: tamaño por mes de signup
CREATE OR REPLACE VIEW admin_cohort_sizes AS
SELECT
  date_trunc('month', created_at)::DATE AS cohort_month,
  COUNT(*) AS size,
  COUNT(*) FILTER (WHERE status = 'active') AS active_now,
  COUNT(*) FILTER (WHERE plan IN ('esencial', 'pro', 'clinica')) AS paid_now
FROM clinics
GROUP BY cohort_month
ORDER BY cohort_month DESC;

-- ────────────────────────────────────────────────────────
--  4. RLS — solo admins ven/modifican estas tablas
-- ────────────────────────────────────────────────────────
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_events ENABLE ROW LEVEL SECURITY;

-- promo_codes: admins leen y escriben; clínicas pueden leer si is_active (para validar al redimir desde el front)
DROP POLICY IF EXISTS "promo_codes_admin_all" ON promo_codes;
CREATE POLICY "promo_codes_admin_all" ON promo_codes
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "promo_codes_clinic_read_active" ON promo_codes;
CREATE POLICY "promo_codes_clinic_read_active" ON promo_codes
  FOR SELECT TO authenticated
  USING (is_active = TRUE);

-- promo_redemptions: admins leen todo; clínica lee sólo las suyas
DROP POLICY IF EXISTS "promo_redemptions_admin_all" ON promo_redemptions;
CREATE POLICY "promo_redemptions_admin_all" ON promo_redemptions
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "promo_redemptions_clinic_read_own" ON promo_redemptions;
CREATE POLICY "promo_redemptions_clinic_read_own" ON promo_redemptions
  FOR SELECT TO authenticated
  USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_id = auth.uid())
  );

-- error_events: sólo admins; el INSERT lo hace el backend con service_role
DROP POLICY IF EXISTS "error_events_admin_read" ON error_events;
CREATE POLICY "error_events_admin_read" ON error_events
  FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "error_events_admin_update" ON error_events;
CREATE POLICY "error_events_admin_update" ON error_events
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ────────────────────────────────────────────────────────
--  5. RPC: redeem_promo_code — atómico
-- ────────────────────────────────────────────────────────
-- Valida + aplica + registra en una sola transacción.
-- Devuelve JSON con el resultado.
CREATE OR REPLACE FUNCTION redeem_promo_code(
  p_code TEXT,
  p_clinic_id UUID,
  p_user_id UUID DEFAULT auth.uid()
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_promo promo_codes%ROWTYPE;
  v_clinic clinics%ROWTYPE;
  v_new_trial_end TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  -- 1. Buscar el código (case-insensitive)
  SELECT * INTO v_promo
  FROM promo_codes
  WHERE LOWER(code) = LOWER(TRIM(p_code))
    AND is_active = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Código no válido');
  END IF;

  -- 2. Validar vigencia
  IF v_promo.starts_at IS NOT NULL AND v_promo.starts_at > NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este código aún no está activo');
  END IF;
  IF v_promo.ends_at IS NOT NULL AND v_promo.ends_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este código ya venció');
  END IF;

  -- 3. Validar límite de redenciones
  IF v_promo.max_redemptions IS NOT NULL
     AND v_promo.redemptions_count >= v_promo.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este código se agotó');
  END IF;

  -- 4. Cargar clínica + validar plan aplicable
  SELECT * INTO v_clinic FROM clinics WHERE id = p_clinic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Clínica no encontrada');
  END IF;

  IF v_promo.applies_to_plans IS NOT NULL
     AND NOT (v_clinic.plan = ANY(v_promo.applies_to_plans)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tu plan actual no es elegible para este código');
  END IF;

  -- 5. Verificar que la clínica no lo haya usado ya
  IF EXISTS (
    SELECT 1 FROM promo_redemptions
    WHERE promo_code_id = v_promo.id AND clinic_id = p_clinic_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta clínica ya usó este código');
  END IF;

  -- 6. Aplicar el efecto según el tipo
  IF v_promo.kind = 'trial_extend' THEN
    v_new_trial_end := COALESCE(v_clinic.trial_ends_at, NOW()) + (v_promo.value || ' days')::INTERVAL;
    UPDATE clinics SET trial_ends_at = v_new_trial_end WHERE id = p_clinic_id;
    v_result := jsonb_build_object(
      'kind', 'trial_extend',
      'days_added', v_promo.value,
      'new_trial_ends_at', v_new_trial_end
    );

  ELSIF v_promo.kind = 'plan_upgrade' THEN
    UPDATE clinics SET plan = v_promo.target_plan WHERE id = p_clinic_id;
    v_result := jsonb_build_object(
      'kind', 'plan_upgrade',
      'new_plan', v_promo.target_plan
    );

  ELSIF v_promo.kind = 'discount_pct' THEN
    v_result := jsonb_build_object(
      'kind', 'discount_pct',
      'percent', v_promo.value,
      'note', 'Se aplicará en tu próxima factura'
    );

  ELSIF v_promo.kind = 'discount_amount' THEN
    v_result := jsonb_build_object(
      'kind', 'discount_amount',
      'amount', v_promo.value,
      'currency', v_promo.currency,
      'note', 'Se aplicará en tu próxima factura'
    );
  END IF;

  -- 7. Registrar la redención
  INSERT INTO promo_redemptions (
    promo_code_id, clinic_id, user_id, applied_kind, applied_value, meta
  ) VALUES (
    v_promo.id, p_clinic_id, p_user_id, v_promo.kind, v_promo.value, v_result
  );

  -- 8. Incrementar contador
  UPDATE promo_codes
  SET redemptions_count = redemptions_count + 1,
      updated_at = NOW()
  WHERE id = v_promo.id;

  RETURN jsonb_build_object(
    'ok', true,
    'code', v_promo.code,
    'result', v_result
  );
END;
$$;

-- ============================================================
--  Fin de migración 007
-- ============================================================
