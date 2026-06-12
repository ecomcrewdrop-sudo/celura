-- ============================================================
--  Migration 011 · Realtime publication para leads/convos/citas
--
--  Hasta ahora solo `notifications` estaba en supabase_realtime,
--  así que postgres_changes no emitía nada para leads, conversations
--  ni appointments. El dashboard se quedaba estático cuando llegaba
--  un mensaje o se agendaba una cita.
--
--  Esta migración:
--    1. Las añade a la publication (idempotente — DO block).
--    2. Asegura REPLICA IDENTITY FULL para que el payload de UPDATE
--       traiga la fila completa, no solo el id.
-- ============================================================

DO $$
BEGIN
  -- leads
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE leads;
  END IF;

  -- conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;

  -- appointments
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
  END IF;
END $$;

-- REPLICA IDENTITY FULL: el evento UPDATE incluye el old row completo
-- (no solo PK). Útil para que el panel sepa qué stage cambió, no solo
-- "algo cambió en leads X".
ALTER TABLE leads REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;
ALTER TABLE appointments REPLICA IDENTITY FULL;
