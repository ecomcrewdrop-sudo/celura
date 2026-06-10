-- ============================================================
--  CELURA · Migración 002 · Vision config (analizador clínico)
--  Activa/desactiva el análisis profesional de imágenes dentales
--  y permite ajustar el comportamiento por clínica.
-- ============================================================

ALTER TABLE clinic_config
  ADD COLUMN IF NOT EXISTS vision_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vision_sensitivity   TEXT    NOT NULL DEFAULT 'balanced'
    CHECK (vision_sensitivity IN ('conservative','balanced','thorough')),
  ADD COLUMN IF NOT EXISTS vision_focus         TEXT[]  NOT NULL DEFAULT
    ARRAY['caries','sarro','encias','desgaste','fracturas','protesis','ortodoncia'],
  ADD COLUMN IF NOT EXISTS vision_auto_suggest  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vision_disclaimer    TEXT    NOT NULL DEFAULT
    'Esto es una observación preliminar. El diagnóstico definitivo requiere valoración presencial.';

COMMENT ON COLUMN clinic_config.vision_enabled      IS 'Si la IA analiza fotos del paciente con criterio clínico (Claude vision)';
COMMENT ON COLUMN clinic_config.vision_sensitivity  IS 'conservative=solo hallazgos evidentes · balanced=confianza media+ · thorough=todo lo observable';
COMMENT ON COLUMN clinic_config.vision_focus        IS 'Áreas clínicas que la IA debe priorizar al analizar';
COMMENT ON COLUMN clinic_config.vision_auto_suggest IS 'Si la IA sugiere tratamiento e invita a agendar tras analizar';
COMMENT ON COLUMN clinic_config.vision_disclaimer   IS 'Frase que la IA siempre incluye para no comprometerse a un diagnóstico';
