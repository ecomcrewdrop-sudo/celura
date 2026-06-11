// ============================================================
//  CELURA · WhatsApp Session Manager con Baileys
//  Aislamiento total: cada clínica tiene su propia sesión.
//  Las sesiones persisten en disco en /sessions/{clinic_id}/
// ============================================================

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  proto,
  WASocket,
  BaileysEventMap,
} from 'baileys'
import { Boom } from '@hapi/boom'
import path from 'path'
import fs from 'fs'
import pino from 'pino'
import { EventEmitter } from 'events'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { persistSession: false } },
)

export interface WAMessage {
  clinic_id: string
  from_jid: string
  from_phone: string
  content: string
  type: 'text' | 'image' | 'audio' | 'document'
  media_url?: string
  media_mimetype?: string
  media_data?: string         // base64 de la imagen descargada
  timestamp: number
  message_id: string
  /**
   * Dirección del mensaje:
   *  - 'incoming' = paciente → asistente (debe activar el brain)
   *  - 'outgoing' = doctor envió desde su teléfono (solo persistir, no responder)
   *  - 'history'  = mensaje del histórico al sincronizar (solo persistir)
   */
  direction: 'incoming' | 'outgoing' | 'history'
  /**
   * Clave opaca del mensaje en Baileys. Necesaria para marcar como leído
   * (doble check azul) y mantener la ilusión de un humano leyendo.
   */
  wa_key?: { remoteJid: string; id: string; fromMe: boolean; participant?: string }
}

// ── Estados de presencia que Baileys soporta ─────────────
export type PresenceState = 'available' | 'unavailable' | 'composing' | 'recording' | 'paused'

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// Emitter global para que el router de mensajes escuche
export const waEvents = new EventEmitter()

// Map de instancias activas: clinic_id → socket
const activeSessions = new Map<string, WASocket>()
// Map de QR codes pendientes: clinic_id → qr_string
const pendingQRs = new Map<string, string>()
// Map de status: clinic_id → 'connecting' | 'qr_ready' | 'connected' | 'disconnected'
const sessionStatus = new Map<string, string>()

const sessionsRoot = process.env['WA_SESSIONS_PATH'] ?? './sessions'
const logger = pino({ level: 'silent' }) // silenciar logs de Baileys en producción

/**
 * Ruta de la sesión en disco para una clínica
 */
function sessionPath(clinicId: string): string {
  return path.join(sessionsRoot, clinicId)
}

/**
 * Asegura que el directorio de sesión existe
 */
function ensureSessionDir(clinicId: string): void {
  const dir = sessionPath(clinicId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Normaliza un JID de WhatsApp a número de teléfono limpio
 * "573001234567@s.whatsapp.net" → "+573001234567"
 */
export function jidToPhone(jid: string): string {
  const number = jid.split('@')[0] ?? ''
  return `+${number}`
}

/**
 * Extrae texto de un mensaje de WhatsApp
 */
function extractText(msg: proto.IWebMessageInfo): string | null {
  const m = msg.message
  if (!m) return null

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    null
  )
}

/**
 * Determina el tipo de mensaje
 */
function getMessageType(msg: proto.IWebMessageInfo): WAMessage['type'] {
  const m = msg.message
  if (!m) return 'text'
  if (m.imageMessage) return 'image'
  if (m.audioMessage) return 'audio'
  if (m.documentMessage) return 'document'
  return 'text'
}

/**
 * Inicia o reconecta la sesión de WhatsApp para una clínica
 */
export async function startSession(
  clinicId: string,
  onQR?: (qr: string) => void
): Promise<void> {
  // Si ya hay sesión activa, no hacer nada
  if (activeSessions.has(clinicId)) {
    console.log(`[WA] Sesión ya activa para clinic ${clinicId}`)
    return
  }

  ensureSessionDir(clinicId)
  sessionStatus.set(clinicId, 'connecting')

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath(clinicId))
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,  // lo manejamos nosotros
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ['Celura', 'Chrome', '121.0.0'],
    generateHighQualityLinkPreview: false,
    // NO sincronizar histórico. El panel solo muestra chats que llegan
    // DESPUÉS de conectar (cuando un paciente escribe → aparece la conv).
    // El doctor no quiere ver años de historial personal en su CRM.
    syncFullHistory: false,
    markOnlineOnConnect: false,
  })

  activeSessions.set(clinicId, sock)

  // ── Guardar credenciales cuando se actualicen ──
  sock.ev.on('creds.update', saveCreds)

  // ── Manejar cambios de conexión ──
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    // QR disponible → enviar al cliente para escanear
    if (qr) {
      pendingQRs.set(clinicId, qr)
      sessionStatus.set(clinicId, 'qr_ready')
      console.log(`[WA] QR listo para clinic ${clinicId}`)
      onQR?.(qr)
      waEvents.emit(`qr:${clinicId}`, qr)
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut

      console.log(`[WA] Conexión cerrada para clinic ${clinicId}. Código: ${statusCode}. Reconectar: ${shouldReconnect}`)

      activeSessions.delete(clinicId)
      sessionStatus.set(clinicId, 'disconnected')
      waEvents.emit(`status:${clinicId}`, 'disconnected')

      if (shouldReconnect) {
        // Esperar 3s antes de reconectar para evitar loops rápidos
        setTimeout(() => startSession(clinicId), 3000)
      } else {
        // Logged out: limpiar sesión del disco
        console.log(`[WA] Sesión cerrada (logout) para clinic ${clinicId}. Limpiando archivos.`)
        deleteSession(clinicId)
      }
    }

    if (connection === 'open') {
      pendingQRs.delete(clinicId)
      sessionStatus.set(clinicId, 'connected')
      const phone = sock.user?.id ? jidToPhone(sock.user.id) : null
      console.log(`[WA] Conectado para clinic ${clinicId} - ${phone}`)

      // Persistir el número conectado + flag para que el panel lo muestre
      try {
        await supabaseAdmin
          .from('clinic_config')
          .update({
            wa_connected: true,
            wa_phone: phone,
            wa_connected_at: new Date().toISOString(),
          })
          .eq('clinic_id', clinicId)
      } catch (err) {
        console.error(`[WA] No se pudo persistir wa_phone para ${clinicId}:`, err)
      }

      waEvents.emit(`status:${clinicId}`, 'connected', phone)
    }
  })

  // ── Procesar mensajes en vivo ──
  // Solo 'notify' = mensaje recibido ahora. 'append' = catch-up de chats
  // viejos (lo ignoramos para no traer historial al panel).
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      const waMsg = await buildWAMessage(sock, clinicId, msg, null)
      if (!waMsg) continue

      if (waMsg.direction === 'incoming') {
        console.log(`[WA] In  ← ${waMsg.from_phone} (clinic ${clinicId}): "${waMsg.content.slice(0, 50)}"`)
        waEvents.emit('message', waMsg)              // brain procesa y responde
      } else {
        console.log(`[WA] Out → ${waMsg.from_phone} (clinic ${clinicId}): "${waMsg.content.slice(0, 50)}"`)
        waEvents.emit('message:outgoing', waMsg)     // solo persistir
      }
    }
  })

  // NOTA: NO escuchamos 'messaging-history.set'. El doctor no quiere ver
  // años de chats personales sincronizados al panel — solo conversaciones
  // que arrancan después de conectar WhatsApp. Si llegan eventos de
  // histórico igual los ignoramos (syncFullHistory=false los reduce mucho).
}

/**
 * Convierte un mensaje Baileys en WAMessage normalizado.
 * Filtra grupos, status, mensajes vacíos.
 * Si `forcedDirection` viene definido, lo respeta (usado para histórico).
 */
async function buildWAMessage(
  sock: WASocket,
  clinicId: string,
  msg: proto.IWebMessageInfo,
  forcedDirection: WAMessage['direction'] | null,
): Promise<WAMessage | null> {
  const jid = msg.key.remoteJid
  if (!jid) return null
  if (jid === 'status@broadcast') return null
  if (jid.endsWith('@g.us')) return null
  if (jid.endsWith('@newsletter')) return null

  const text = extractText(msg)
  const msgType = getMessageType(msg)
  if (msgType === 'text' && !text) return null

  const direction: WAMessage['direction'] =
    forcedDirection ?? (msg.key.fromMe ? 'outgoing' : 'incoming')

  const waMsg: WAMessage = {
    clinic_id: clinicId,
    from_jid: jid,
    from_phone: jidToPhone(jid),
    content: text ?? '',
    type: msgType,
    timestamp: (msg.messageTimestamp as number) * 1000 || Date.now(),
    message_id: msg.key.id ?? '',
    direction,
    wa_key: msg.key.id
      ? {
          remoteJid: jid,
          id: msg.key.id,
          fromMe: msg.key.fromMe ?? false,
          ...(msg.key.participant ? { participant: msg.key.participant } : {}),
        }
      : undefined,
  }

  // Solo descargamos la imagen para mensajes en vivo entrantes — el
  // histórico se queda como referencia (no gastamos vision en cada foto vieja).
  if (
    msgType === 'image' &&
    direction === 'incoming' &&
    forcedDirection === null &&
    msg.message?.imageMessage
  ) {
    try {
      const buffer = (await downloadMediaMessage(
        msg,
        'buffer',
        {},
        { logger, reuploadRequest: sock.updateMediaMessage },
      )) as Buffer
      waMsg.media_mimetype = msg.message.imageMessage.mimetype ?? 'image/jpeg'
      waMsg.media_data = buffer.toString('base64')
    } catch (err) {
      console.error(`[WA] Error descargando imagen de ${waMsg.from_phone}:`, err)
    }
  }

  return waMsg
}

/**
 * Convierte un número "+573001234567" al JID de WhatsApp.
 */
function phoneToJid(phone: string): string {
  return `${phone.replace('+', '')}@s.whatsapp.net`
}

/**
 * Envía un mensaje de texto a un número (un intento, sin retry).
 * Usar `sendMessageWithRetry` para el flujo de producción.
 */
export async function sendMessage(
  clinicId: string,
  toPhone: string,
  text: string
): Promise<boolean> {
  const sock = activeSessions.get(clinicId)
  if (!sock) {
    console.error(`[WA] No hay sesión activa para clinic ${clinicId}`)
    return false
  }

  try {
    await sock.sendMessage(phoneToJid(toPhone), { text })
    return true
  } catch (err) {
    console.error(`[WA] Error enviando mensaje a ${toPhone}:`, err)
    return false
  }
}

/**
 * Envía con reintentos exponenciales. Si los 3 intentos fallan, devuelve false.
 * Intervalos: inmediato, 2s, 5s.
 */
export async function sendMessageWithRetry(
  clinicId: string,
  toPhone: string,
  text: string,
): Promise<boolean> {
  const delays = [0, 2000, 5000]
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]! > 0) await sleep(delays[i]!)
    const ok = await sendMessage(clinicId, toPhone, text)
    if (ok) {
      if (i > 0) console.log(`[WA] Envío OK en reintento #${i + 1} → ${toPhone}`)
      return true
    }
    console.warn(`[WA] Envío fallido (intento ${i + 1}/${delays.length}) → ${toPhone}`)
  }
  return false
}

/**
 * Actualiza la presencia para un chat puntual (composing = "escribiendo...",
 * paused = quitar el indicador, recording = "grabando audio", etc.).
 * Antes de cambiar presencia para un JID, Baileys exige enviar
 * `sendPresenceUpdate('available')` global (lo hacemos cacheado).
 */
const presenceInitialized = new Set<string>()
export async function setChatPresence(
  clinicId: string,
  toPhone: string,
  state: PresenceState,
): Promise<void> {
  const sock = activeSessions.get(clinicId)
  if (!sock) return
  try {
    // Solo la primera vez por sesión: anunciar que estamos "online"
    if (!presenceInitialized.has(clinicId)) {
      await sock.sendPresenceUpdate('available')
      presenceInitialized.add(clinicId)
    }
    await sock.sendPresenceUpdate(state, phoneToJid(toPhone))
  } catch (err) {
    // Presencia es best-effort: si falla no rompemos el flujo
    console.warn(`[WA] No se pudo actualizar presencia ${state} para ${toPhone}:`, (err as Error).message)
  }
}

/**
 * Marca uno o varios mensajes como leídos (doble check azul en el remitente).
 * Es lo que hace un humano al abrir el chat.
 */
export async function markMessagesRead(
  clinicId: string,
  keys: Array<{ remoteJid: string; id: string; fromMe: boolean; participant?: string }>,
): Promise<void> {
  const sock = activeSessions.get(clinicId)
  if (!sock || keys.length === 0) return
  try {
    await sock.readMessages(keys)
  } catch (err) {
    console.warn(`[WA] No se pudo marcar como leído:`, (err as Error).message)
  }
}

/** Limpia el flag de presencia inicializada cuando se cierra la sesión. */
function resetPresenceFlag(clinicId: string): void {
  presenceInitialized.delete(clinicId)
}

/**
 * Retorna el QR pendiente de una clínica (si existe)
 */
export function getPendingQR(clinicId: string): string | null {
  return pendingQRs.get(clinicId) ?? null
}

/**
 * Retorna el teléfono del socket activo (si existe)
 */
export function getSessionPhone(clinicId: string): string | null {
  const sock = activeSessions.get(clinicId)
  if (!sock?.user?.id) return null
  return jidToPhone(sock.user.id)
}

/**
 * Retorna el status de conexión de una clínica
 */
export function getSessionStatus(clinicId: string): string {
  return sessionStatus.get(clinicId) ?? 'disconnected'
}

/**
 * Cierra la sesión de una clínica (sin borrar archivos)
 */
export async function closeSession(clinicId: string): Promise<void> {
  const sock = activeSessions.get(clinicId)
  if (sock) {
    await sock.logout()
    activeSessions.delete(clinicId)
    sessionStatus.set(clinicId, 'disconnected')
    resetPresenceFlag(clinicId)
  }
}

/**
 * Borra la sesión del disco (para logout total o cancelación)
 */
export function deleteSession(clinicId: string): void {
  const dir = sessionPath(clinicId)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  activeSessions.delete(clinicId)
  pendingQRs.delete(clinicId)
  sessionStatus.delete(clinicId)
  resetPresenceFlag(clinicId)
}

/**
 * Al arrancar el servidor: reconectar todas las sesiones existentes
 * (las clínicas que ya habían conectado no tienen que escanear QR de nuevo)
 */
export async function restoreAllSessions(): Promise<void> {
  if (!fs.existsSync(sessionsRoot)) {
    fs.mkdirSync(sessionsRoot, { recursive: true })
    return
  }

  const clinicDirs = fs.readdirSync(sessionsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  console.log(`[WA] Restaurando ${clinicDirs.length} sesiones...`)

  for (const clinicId of clinicDirs) {
    const credsFile = path.join(sessionsRoot, clinicId, 'creds.json')
    if (fs.existsSync(credsFile)) {
      console.log(`[WA] Restaurando sesión para clinic ${clinicId}`)
      // Sin await para no bloquear el arranque del servidor
      startSession(clinicId).catch(err =>
        console.error(`[WA] Error restaurando ${clinicId}:`, err)
      )
    }
  }
}
