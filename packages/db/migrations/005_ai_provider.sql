-- ============================================================
--  CELURA · Selector de proveedor de IA
--  Permite que cada clínica elija entre Claude (Anthropic) y
--  ChatGPT (OpenAI) para su asistente conversacional + vision.
-- ============================================================

ALTER TABLE clinic_config
  ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'claude'
    CHECK (ai_provider IN ('claude', 'openai')),
  ADD COLUMN IF NOT EXISTS openai_key_enc TEXT;

-- Las clínicas existentes que ya tienen claude_key_enc quedan en 'claude'
-- por el default. Las nuevas también, hasta que cambien en Configuración.

COMMENT ON COLUMN clinic_config.ai_provider IS 'Proveedor activo: claude | openai';
COMMENT ON COLUMN clinic_config.openai_key_enc IS 'API key de OpenAI encriptada AES-256-GCM';
