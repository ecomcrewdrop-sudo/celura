// ============================================================
//  CELURA · Humanizer · Capa de comportamiento humano para WA
//  ------------------------------------------------------------
//  Lo que el doctor le promete al paciente es que del otro lado
//  hay una persona. Esta capa hace honor a esa promesa:
//
//   1. ENTRADA (anti-rebote)
//      Si el paciente manda 3 mensajes seguidos en 5s, no
//      respondemos 3 veces como un bot. Bufferamos por
//      (clinic, teléfono), esperamos a que termine de escribir
//      y procesamos UNA sola vez con todo el contexto.
//
//   2. LECTURA (doble check azul)
//      Cuando "abrimos" el chat para responder, marcamos todos
//      los mensajes acumulados como leídos. Como una persona
//      que recién destrabó el teléfono.
//
//   3. SALIDA (composing + delay + split)
//      Antes de enviar mostramos "escribiendo…", esperamos un
//      tiempo proporcional a la longitud (con jitter aleatorio),
//      partimos respuestas largas en 1-3 burbujas naturales y
//      enviamos con reintentos. Al terminar bajamos la presencia.
//
//   4. MUTEX por lead
//      Si entran 2 ráfagas pegadas, la segunda espera a que
//      termine la primera. Nunca se cruzan respuestas.
// ============================================================

import {
  type WAMessage,
  setChatPresence,
  markMessagesRead,
  sendMessageWithRetry,
} from './whatsapp.js'
import { persistRawMessage, processMessage } from './brain.js'

// ── Constantes de timing ──────────────────────────────────
// Pensadas para WhatsApp en español: la gente manda frases
// cortas seguidas. Si esperas demasiado se siente lento;
// si respondes al primer mensaje cortas al paciente.
const DEBOUNCE_MS = 4000   // tiempo de gracia desde el último mensaje
const MAX_WAIT_MS = 8000   // tope absoluto desde el primero

const MIN_DELAY_MS = 1500
const MAX_DELAY_MS = 9000
const CHAR_DELAY_MS = 40   // ms por carácter "tipeado"
const JITTER_MS = 600      // aleatoriedad para evitar patrones

// ── Buffer de entrada por (clínica + teléfono) ───────────
type BufferEntry = {
  messages: WAMessage[]
  firstReceivedAt: number
  debounceTimer: NodeJS.Timeout
  hardTimer: NodeJS.Timeout
}

const buffers = new Map<string, BufferEntry>()
// Mutex por lead via tail-chaining de Promesas
const leadLocks = new Map<string, Promise<void>>()

const bufferKey = (clinicId: string, phone: string): string =>
  `${clinicId}::${phone}`

const sleep = (ms: number): Promise<void> =>
  new Promise<void>(r => setTimeout(r, ms))

function clearTimers(entry: BufferEntry): void {
  clearTimeout(entry.debounceTimer)
  clearTimeout(entry.hardTimer)
}

/**
 * Encola un mensaje entrante en su buffer. Si llega otro del mismo
 * paciente antes de DEBOUNCE_MS, reseteamos el contador y esperamos
 * más — pero nunca más allá de MAX_WAIT_MS desde el primero.
 *
 * Mensajes que NO sean 'incoming' deben ir por otra vía
 * (los outgoing/history no activan el brain).
 */
export function enqueueIncoming(msg: WAMessage): void {
  if (msg.direction !== 'incoming') return

  const key = bufferKey(msg.clinic_id, msg.from_phone)
  const existing = buffers.get(key)

  if (existing) {
    existing.messages.push(msg)
    clearTimeout(existing.debounceTimer)
    existing.debounceTimer = setTimeout(() => flush(key), DEBOUNCE_MS)
    return
  }

  const now = Date.now()
  const entry: BufferEntry = {
    messages: [msg],
    firstReceivedAt: now,
    debounceTimer: setTimeout(() => flush(key), DEBOUNCE_MS),
    hardTimer: setTimeout(() => flush(key), MAX_WAIT_MS),
  }
  buffers.set(key, entry)
}

/**
 * Vacía el buffer de un lead y encadena el procesamiento al mutex.
 * Idempotente: si ya se vació, no hace nada.
 */
function flush(key: string): void {
  const entry = buffers.get(key)
  if (!entry) return
  clearTimers(entry)
  buffers.delete(key)

  const prev = leadLocks.get(key) ?? Promise.resolve()
  const next = prev
    .then(() => processBatch(entry.messages))
    .catch(err => {
      console.error('[Humanizer] processBatch error:', err)
    })
    .finally(() => {
      // Solo liberamos el lock si nadie más lo encadenó después
      if (leadLocks.get(key) === next) leadLocks.delete(key)
    })
  leadLocks.set(key, next)
}

/**
 * Procesa un lote acumulado:
 *  - marca todo como leído (doble check azul)
 *  - persiste los N-1 primeros como histórico (sin disparar respuesta)
 *  - el último entra al brain con la conversación ya enriquecida
 */
async function processBatch(messages: WAMessage[]): Promise<void> {
  if (messages.length === 0) return
  const last = messages[messages.length - 1]!
  const { clinic_id, from_phone } = last

  // 1. Marcar TODOS como leídos antes de "pensar". Es el gesto
  //    natural de quien abre el chat y ve los mensajes pendientes.
  const keys = messages
    .map(m => m.wa_key)
    .filter((k): k is NonNullable<WAMessage['wa_key']> => !!k)
  if (keys.length > 0) {
    await markMessagesRead(clinic_id, keys)
  }

  // 2. Persistir los previos como 'history' para que queden en la
  //    conversación y el brain los vea como contexto al cargar.
  for (let i = 0; i < messages.length - 1; i++) {
    const m = messages[i]!
    await persistRawMessage({ ...m, direction: 'history' })
  }

  // 3. El último mensaje activa el brain (responde con todo el contexto)
  console.log(
    `[Humanizer] Lote consumido · clinic=${clinic_id} · phone=${from_phone} · ` +
    `mensajes=${messages.length}`,
  )
  await processMessage(last)
}

// ── Envío humanizado ──────────────────────────────────────

/**
 * Cuánto "tarda" el asistente en escribir un mensaje según su longitud,
 * con aleatoriedad para no caer en un patrón medible.
 *   base = 0.8s + 40ms/carácter + jitter (0-600ms)
 *   clamp = [1.5s, 9s]
 *
 * Para una respuesta de 100 caracteres da ~5s, que es lo que tarda
 * un asistente real tipeando con cuidado.
 */
function humanDelayFor(text: string): number {
  const base = 800 + text.length * CHAR_DELAY_MS + Math.random() * JITTER_MS
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, base))
}

/**
 * Divide la respuesta en burbujas "humanas":
 *  1. Si hay párrafos separados por línea en blanco → uno por burbuja
 *  2. Si es un texto largo (>280 char) sin párrafos → cortamos por oración
 *  3. Limitamos a 3 burbujas: las sobrantes se unen al final para no spam
 *
 * Mensajes cortos (un saludo, un sí/no) salen en una sola burbuja.
 */
export function splitForHuman(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // 1) Cortes por párrafo (lo más natural)
  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map(s => s.trim())
    .filter(Boolean)
  let chunks = paragraphs.length > 0 ? paragraphs : [trimmed]

  // 2) Si no hubo párrafos pero es largo, partir por oraciones
  if (chunks.length === 1 && trimmed.length > 280) {
    const sentences = trimmed.match(/[^.!?…]+[.!?…]+\s*|\S[^.!?…]*$/g)
    if (sentences && sentences.length > 1) {
      chunks = sentences.map(s => s.trim()).filter(Boolean)
    }
  }

  // 3) Tope de 3 burbujas: las sobrantes se concatenan en la última
  if (chunks.length > 3) {
    const head = chunks.slice(0, 2)
    const tail = chunks.slice(2).join(' ')
    chunks = [...head, tail]
  }

  return chunks
}

/**
 * Envío del asistente con comportamiento humano completo:
 *   • presencia "composing" (animación de "escribiendo…")
 *   • delay proporcional al chunk (con jitter)
 *   • partir respuesta larga en 1-3 burbujas
 *   • reintentos exponenciales por burbuja
 *   • presencia "paused" al cerrar (quita el indicador)
 *
 * Devuelve true solo si TODAS las burbujas se enviaron.
 */
export async function sendHumanlike(
  clinicId: string,
  toPhone: string,
  text: string,
): Promise<boolean> {
  const chunks = splitForHuman(text)
  if (chunks.length === 0) return false

  let allOk = true
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!
      await setChatPresence(clinicId, toPhone, 'composing')
      await sleep(humanDelayFor(chunk))
      const ok = await sendMessageWithRetry(clinicId, toPhone, chunk)
      if (!ok) {
        allOk = false
        break
      }
      // Pausa breve entre burbujas para que no parezca ráfaga automática
      if (i < chunks.length - 1) {
        await sleep(400 + Math.random() * 400)
      }
    }
  } finally {
    // Siempre bajamos la presencia, incluso si algún chunk falló
    try {
      await setChatPresence(clinicId, toPhone, 'paused')
    } catch {
      /* best-effort */
    }
  }
  return allOk
}
