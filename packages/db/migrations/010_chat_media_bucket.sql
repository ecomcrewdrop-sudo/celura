-- ============================================================
--  CELURA · Migración 010 · Bucket de medios para chat
--  Almacena fotos (y futuro audio) que los pacientes envían
--  por WhatsApp para que el doctor pueda verlas en el panel.
-- ============================================================

-- Crear el bucket público "chat-media" si no existe.
-- Es público porque los paths incluyen UUIDs no enumerables y las
-- imágenes son contenido que el paciente ya envió por WhatsApp.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  TRUE,
  10485760, -- 10 MB por archivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/ogg', 'audio/mpeg', 'audio/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/ogg', 'audio/mpeg', 'audio/mp4'];

-- Policies: cualquiera con la URL puede leer (bucket público).
-- Solo el service_role puede insertar/borrar (lo hace el API server con
-- supabaseAdmin; el cliente del dashboard nunca sube).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'chat_media_public_read'
  ) THEN
    CREATE POLICY "chat_media_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'chat-media');
  END IF;
END $$;
