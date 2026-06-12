// ============================================================
//  CELURA · Upload de medios de chat a Supabase Storage
//  Sube fotos/audios del paciente al bucket "chat-media" y
//  devuelve una URL pública para mostrar en el panel.
//  Path: chat-media/<clinic_id>/<random>.<ext>
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const supabaseAdmin = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const BUCKET = 'chat-media'

function extFromMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('gif')) return 'gif'
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('mpeg')) return 'mp3'
  if (m.includes('mp4')) return 'm4a'
  return 'bin'
}

/**
 * Sube un buffer (o base64) al bucket chat-media y devuelve la URL pública.
 * Si falla devuelve null — el caller decide si persistir el mensaje sin
 * media_url o reintentar.
 */
export async function uploadChatMedia(
  clinicId: string,
  base64OrBuffer: string | Buffer,
  mimetype: string,
): Promise<string | null> {
  try {
    const buffer =
      typeof base64OrBuffer === 'string'
        ? Buffer.from(base64OrBuffer, 'base64')
        : base64OrBuffer
    const ext = extFromMime(mimetype)
    const path = `${clinicId}/${randomUUID()}.${ext}`

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: mimetype,
        upsert: false,
        cacheControl: '31536000', // 1 año — los media son inmutables
      })

    if (error) {
      console.error(`[ChatMedia] Upload falló (${clinicId}, ${mimetype}):`, error.message)
      return null
    }

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
    return pub?.publicUrl ?? null
  } catch (err) {
    console.error(`[ChatMedia] Excepción subiendo media:`, (err as Error).message)
    return null
  }
}
