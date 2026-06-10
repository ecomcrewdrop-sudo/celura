-- ============================================================
--  CELURA · Beta access (programa de usuarios de prueba)
--  Añade flag para distinguir clínicas creadas durante la beta.
-- ============================================================

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS is_beta BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS beta_started_at TIMESTAMPTZ;

-- Índice para listar betas rápido en admin
CREATE INDEX IF NOT EXISTS idx_clinics_is_beta ON clinics(is_beta) WHERE is_beta = TRUE;
