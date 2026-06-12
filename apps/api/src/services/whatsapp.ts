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
import { trackErrorSync } from './error-tracker.js'
import {
  sendWaConnectedEmail,
  sendWaDisconnectedEmail,
} from './email/index.js'
import { notify, getClinicOwnerContact } from './notifications.js'

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
// Map de envíos pendientes de ACK: messageId → resolver
// Baileys despacha el ACK de dos formas:
//  · messages.upsert(notify) con key.fromMe=true → echo local del envío
//  · messages.update con status=1/2/3/4 → confirmación del servidor de WA
// Escuchamos AMBOS — el primero que llegue resuelve el envío como entregado.
// Si NO llega ninguno en SEND_ACK_TIMEOUT_MS resolvemos false.
const pendingSendAcks = new Map<string, (delivered: boolean) => void>()
const SEND_ACK_TIMEOUT_MS = 4_000

// Contador rolling de fallos consecutivos por clínica. Si supera el umbral,
// asumimos session zombie y disparamos forceReconnect automático.
const consecutiveSendFails = new Map<string, number>()
const AUTO_RECONNECT_FAIL_THRESHOLD = 3
const reconnectInFlight = new Set<string>()

// Cache de JID por (clinic, phone). Crítico para responder al MISMO JID
// que envió el inbound — si el paciente vino por @lid, debemos contestar
// a @lid; si vino por @s.whatsapp.net, a @s.whatsapp.net. Reconstruir el
// JID a partir del teléfono falla silenciosamente cuando el formato no
// coincide y Baileys descarta el envío sin error.
const jidByPhone = new Map<string, Map<string, string>>()

function rememberJid(clinicId: string, phone: string, jid: string): void {
  let inner = jidByPhone.get(clinicId)
  if (!inner) {
    inner = new Map<string, string>()
    jidByPhone.set(clinicId, inner)
  }
  inner.set(phone, jid)
}

function lookupJid(clinicId: string, phone: string): string | null {
  return jidByPhone.get(clinicId)?.get(phone) ?? null
}

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

      // Registrar el cierre como error (warning si reconecta, critical si fue logout)
      trackErrorSync({
        source: 'baileys',
        code: shouldReconnect ? 'CONNECTION_LOST' : 'LOGGED_OUT',
        severity: shouldReconnect ? 'warning' : 'critical',
        error: lastDisconnect?.error ?? new Error(`status ${statusCode}`),
        clinicId,
        context: { statusCode, willReconnect: shouldReconnect },
      })

      activeSessions.delete(clinicId)
      sessionStatus.set(clinicId, 'disconnected')
      waEvents.emit(`status:${clinicId}`, 'disconnected')

      // ── Sincronizar Supabase: si NO va a reconectar, marcar wa_connected=false
      //     para que el panel del doctor lo muestre desconectado y la guía
      //     de setup vuelva a empujar al paso "Conectar WhatsApp". Si va a
      //     reconectar solo, dejamos el flag en true (es un blip transitorio).
      if (!shouldReconnect) {
        try {
          await supabaseAdmin
            .from('clinic_config')
            .update({ wa_connected: false })
            .eq('clinic_id', clinicId)
        } catch (err) {
          console.error(`[WA] No se pudo persistir wa_connected=false para ${clinicId}:`, err)
        }
      }

      // ── Notificación al doctor (email + in-app) ──
      // Solo cuando es logout real (no si va a reconectar solo).
      // Evita ruido si la conexión rebota cada minuto.
      if (!shouldReconnect) {
        ;(async () => {
          try {
            const owner = await getClinicOwnerContact(clinicId)
            if (owner?.owner_email) {
              await sendWaDisconnectedEmail(owner.owner_email, {
                ownerName: owner.owner_name,
                clinic: {
                  id: owner.clinic_id,
                  name: owner.clinic_name,
                },
                reason: 'Sesión cerrada desde otro dispositivo o expiró el token',
              })
            }
            await notify(clinicId, {
              kind: 'wa_disconnected',
              severity: 'critical',
              title: 'Tu WhatsApp se desconectó',
              body: 'Mientras esté así, los pacientes nuevos no reciben respuesta automática. Reconectar toma 1 minuto.',
              icon: 'WifiOff',
              action_url: '/dashboard/whatsapp',
              action_label: 'Reconectar',
              entity_type: 'clinic',
              entity_id: clinicId,
            })
          } catch (err) {
            console.warn(
              `[WA] notify wa_disconnected falló para ${clinicId}:`,
              (err as Error).message,
            )
          }
        })()
      }

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

      // ── Notificación al doctor (email + in-app) ──
      // Solo en la primera conexión real (no en reconexiones automáticas
      // rápidas — dedup por entidad lo absorbe).
      ;(async () => {
        try {
          const owner = await getClinicOwnerContact(clinicId)
          if (owner?.owner_email) {
            await sendWaConnectedEmail(owner.owner_email, {
              ownerName: owner.owner_name,
              clinic: {
                id: owner.clinic_id,
                name: owner.clinic_name,
              },
              phone,
            })
          }
          await notify(clinicId, {
            kind: 'wa_connected',
            severity: 'success',
            title: 'Tu asistente está en línea',
            body: phone
              ? `Conectado al número ${phone}.`
              : 'Conectada y respondiendo en automático.',
            icon: 'CheckCircle2',
            action_url: '/dashboard/conversations',
            action_label: 'Ver conversaciones',
            entity_type: 'clinic',
            entity_id: clinicId,
          })
        } catch (err) {
          console.warn(
            `[WA] notify wa_connected falló para ${clinicId}:`,
            (err as Error).message,
          )
        }
      })()
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
        // Cachear el JID exacto del que viene el inbound — al responder
        // usaremos este mismo JID para evitar el bug del @lid vs @s.whatsapp.net.
        if (msg.key.remoteJid) {
          rememberJid(clinicId, waMsg.from_phone, msg.key.remoteJid)
        }
        waEvents.emit('message', waMsg)              // brain procesa y responde
      } else {
        console.log(`[WA] Out → ${waMsg.from_phone} (clinic ${clinicId}): "${waMsg.content.slice(0, 50)}"`)
        // Echo local del envío — Baileys lo emite cuando un mensaje fromMe
        // entra a su pipeline. Resuelve el ACK pendiente si hay uno.
        const ackId = msg.key.id
        if (ackId) {
          const resolver = pendingSendAcks.get(ackId)
          if (resolver) {
            pendingSendAcks.delete(ackId)
            resolver(true)
          }
        }
        waEvents.emit('message:outgoing', waMsg)     // solo persistir
      }
    }
  })

  // ── ACK por cambio de status (server-side) ──
  // messages.update se dispara cuando WhatsApp confirma del servidor el envío.
  // status 1 = pending, 2 = server ACK, 3 = delivered, 4 = read.
  // Resolver el ACK aquí cubre el caso en que upsert(notify) NO se dispara
  // para ciertos mensajes fromMe en algunas versiones de Baileys.
  sock.ev.on('messages.update', async (updates) => {
    for (const u of updates) {
      const ackId = u.key?.id
      if (!ackId) continue
      const status = u.update?.status
      // status >= 1 (PENDING) ya significa que entró al pipeline de WA
      if (status && status >= 1) {
        const resolver = pendingSendAcks.get(ackId)
        if (resolver) {
          pendingSendAcks.delete(ackId)
          resolver(true)
        }
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

  // Descargamos imagen O audio para mensajes en vivo entrantes.
  // El histórico se queda como referencia (no re-procesamos años de media).
  const shouldDownloadMedia =
    direction === 'incoming' &&
    forcedDirection === null &&
    (msgType === 'image' || msgType === 'audio')

  if (shouldDownloadMedia) {
    try {
      const buffer = (await downloadMediaMessage(
        msg,
        'buffer',
        {},
        { logger, reuploadRequest: sock.updateMediaMessage },
      )) as Buffer
      if (msgType === 'image' && msg.message?.imageMessage) {
        waMsg.media_mimetype = msg.message.imageMessage.mimetype ?? 'image/jpeg'
      } else if (msgType === 'audio' && msg.message?.audioMessage) {
        // Las notas de voz de WhatsApp vienen como audio/ogg; codec=opus.
        // Whisper lo acepta directo.
        waMsg.media_mimetype = msg.message.audioMessage.mimetype ?? 'audio/ogg'
      }
      waMsg.media_data = buffer.toString('base64')
    } catch (err) {
      console.error(
        `[WA] Error descargando ${msgType} de ${waMsg.from_phone}:`,
        (err as Error).message,
      )
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
 *
 * Nota: Baileys a veces resuelve `sendMessage` con un key.id pero el mensaje
 * jamás se despacha (session keys corruptas, pre-key bundle no encontrado,
 * etc). Por eso NO confiamos en el return de sock.sendMessage solo.
 * Esperamos el ACK real: cuando Baileys despacha de verdad, emite
 * messages.upsert(notify) con la misma key. Si el ACK no llega dentro
 * del timeout, asumimos delivery fail.
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

  const status = sessionStatus.get(clinicId)
  if (status !== 'connected') {
    console.error(
      `[WA] Sesión existe pero no está conectada (status=${status ?? 'unknown'}) para clinic ${clinicId} — rechazando envío`,
    )
    return false
  }

  // Resolver el JID con prioridad:
  //  1) Cache en memoria (poblado desde inbound del mismo paciente).
  //  2) Tabla leads.phone_wa_id (persiste entre reinicios del servidor).
  //  3) sock.onWhatsApp() — WhatsApp nos devuelve el JID canónico.
  //  4) phoneToJid() — fallback final, asume @s.whatsapp.net.
  // Esto evita el bug donde un paciente conectado por @lid recibía el envío
  // a un JID @s.whatsapp.net inválido y Baileys lo descartaba silenciosamente.
  let targetJid = lookupJid(clinicId, toPhone)
  if (!targetJid) {
    try {
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('phone_wa_id')
        .eq('clinic_id', clinicId)
        .eq('phone', toPhone)
        .maybeSingle<{ phone_wa_id: string | null }>()
      if (lead?.phone_wa_id) {
        targetJid = lead.phone_wa_id
        rememberJid(clinicId, toPhone, lead.phone_wa_id)
      }
    } catch {
      // best-effort: si la lookup falla seguimos al fallback
    }
  }
  if (!targetJid) {
    try {
      const probe = await sock.onWhatsApp(toPhone.replace('+', ''))
      const found = probe?.[0]
      if (found?.exists && found.jid) {
        targetJid = found.jid
        rememberJid(clinicId, toPhone, found.jid)
        console.log(`[WA] JID resuelto via onWhatsApp para ${toPhone} → ${found.jid}`)
      }
    } catch (err) {
      console.warn(`[WA] onWhatsApp falló para ${toPhone}: ${(err as Error).message}`)
    }
  }
  if (!targetJid) targetJid = phoneToJid(toPhone)

  let messageId: string | undefined
  try {
    const result = await sock.sendMessage(targetJid, { text })
    messageId = result?.key?.id ?? undefined
    if (!messageId) {
      console.error(`[WA] sendMessage devolvió sin key.id para ${toPhone} (jid=${targetJid}) — no se entregó`)
      return false
    }
  } catch (err) {
    console.error(`[WA] Error enviando mensaje a ${toPhone} (jid=${targetJid}):`, err)
    return false
  }

  // Esperar el ACK real: Baileys emite messages.upsert(notify) cuando el mensaje
  // saliente entra realmente al pipeline de WhatsApp. Si no llega en SEND_ACK_TIMEOUT_MS
  // asumimos que el mensaje quedó en limbo (session zombie / silent buffer).
  const delivered = await new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }

    pendingSendAcks.set(messageId!, (ok) => finish(ok))

    setTimeout(() => {
      if (pendingSendAcks.has(messageId!)) {
        pendingSendAcks.delete(messageId!)
        console.error(
          `[WA] Timeout esperando ACK de ${toPhone} (msg=${messageId}) tras ${SEND_ACK_TIMEOUT_MS}ms — Baileys aceptó pero no despachó`,
        )
        finish(false)
      }
    }, SEND_ACK_TIMEOUT_MS)
  })

  if (delivered) {
    console.log(`[WA] ACK confirmado para ${toPhone} (msg=${messageId})`)
    consecutiveSendFails.set(clinicId, 0)
  } else {
    const fails = (consecutiveSendFails.get(clinicId) ?? 0) + 1
    consecutiveSendFails.set(clinicId, fails)
    // Si pasamos el umbral y no hay ya una reconexión en curso, la disparamos
    // en background. NO esperamos — el reintento del caller se beneficiará de
    // la sesión nueva si su delay es suficiente.
    if (fails >= AUTO_RECONNECT_FAIL_THRESHOLD && !reconnectInFlight.has(clinicId)) {
      console.warn(
        `[WA] ⚠️  ${fails} envíos consecutivos fallidos para clinic ${clinicId} — auto-reconexión`,
      )
      reconnectInFlight.add(clinicId)
      forceReconnect(clinicId)
        .catch(err => console.error(`[WA] Auto-reconexión falló: ${err?.message ?? err}`))
        .finally(() => {
          reconnectInFlight.delete(clinicId)
          consecutiveSendFails.set(clinicId, 0)
        })
    }
  }
  return delivered
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
  // Total wall-clock peor caso: 4s (ACK) + 1s + 4s + 3s + 4s ≈ 16s.
  // El 3er intento llega DESPUÉS de que la auto-reconexión típica termina (~8s)
  // si el primer fallo la disparó.
  const delays = [0, 1000, 3000]
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
    const presenceJid = lookupJid(clinicId, toPhone) ?? phoneToJid(toPhone)
    await sock.sendPresenceUpdate(state, presenceJid)
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
 * Reinicia la sesión SIN invalidar credenciales: corta el socket actual
 * (útil cuando Baileys queda "zombi" aceptando sends pero sin despachar)
 * y arranca una nueva conexión usando las mismas creds. El usuario NO
 * necesita escanear QR otra vez.
 */
export async function forceReconnect(clinicId: string): Promise<void> {
  console.log(`[WA] 🔄 Forzando reconexión de clinic ${clinicId}`)
  const sock = activeSessions.get(clinicId)
  if (sock) {
    try {
      // end() cierra el WS sin enviar logout → creds.json queda intacto
      sock.end(new Error('force-reconnect'))
    } catch (err) {
      console.warn(`[WA] Error cerrando socket en forceReconnect:`, err)
    }
    activeSessions.delete(clinicId)
    resetPresenceFlag(clinicId)
  }
  // Limpiar ACKs colgados de la sesión vieja
  for (const [, resolver] of pendingSendAcks) resolver(false)
  pendingSendAcks.clear()
  // Limpiar cache de JIDs (la próxima inbound los re-poblará — o leeremos
  // de leads.phone_wa_id si vuelve un paciente conocido).
  jidByPhone.delete(clinicId)
  sessionStatus.set(clinicId, 'connecting')

  // Arranque inmediato — startSession releerá creds.json desde disco
  await startSession(clinicId)
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
