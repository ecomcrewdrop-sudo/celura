-- ============================================================
--  CELURA · Migración 003 · Workflows (motor visual del asistente)
--  Cada clínica tiene N workflows. Un workflow = trigger + grafo
--  de bloques (condition/action). Se evalúa antes de Claude.
-- ============================================================

CREATE TABLE IF NOT EXISTS workflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  name            TEXT    NOT NULL,
  description     TEXT    NOT NULL DEFAULT '',
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  priority        INT     NOT NULL DEFAULT 0,        -- mayor = se evalúa primero

  -- Estructura completa del workflow en JSON. Forma:
  --   { trigger: { id, type, params, next }, blocks: { [id]: Block } }
  -- Se valida en la API con Zod antes de guardar.
  graph           JSONB   NOT NULL DEFAULT '{"trigger":null,"blocks":{}}'::jsonb,

  -- Telemetría rápida
  runs_total      INT     NOT NULL DEFAULT 0,
  runs_matched    INT     NOT NULL DEFAULT 0,
  last_run_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_clinic_enabled
  ON workflows (clinic_id, enabled, priority DESC);

-- Trigger de updated_at (reutiliza función ya creada en schema.sql)
DROP TRIGGER IF EXISTS trg_workflows_updated_at ON workflows;
CREATE TRIGGER trg_workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

COMMENT ON TABLE  workflows               IS 'Workflows del asistente: trigger + grafo de bloques';
COMMENT ON COLUMN workflows.priority      IS 'Mayor = se evalúa primero. Permite resolver conflictos cuando varios workflows matchean';
COMMENT ON COLUMN workflows.graph         IS 'JSON con trigger y blocks. Forma validada por Zod en /api/workflows';
COMMENT ON COLUMN workflows.runs_matched  IS 'Cuántas veces este workflow ejecutó al menos una acción';
