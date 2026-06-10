// ============================================================
//  CELURA · Rutas de WhatsApp
//  GET  /whatsapp/qr     → genera QR para escanear
//  GET  /whatsapp/status → estado de conexión
//  POST /whatsapp/disconnect → desconectar
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import QRCode from 'qrcode'
import {
  startSession,
  getPendingQR,
  getSessionStatus,
  closeSession,
  waEvents,
} from '../services/whatsapp.js'

export default async function whatsappRoutes(fastify: FastifyInstance) {

  // ── GET /whatsapp/status ──────────────────────────────────
  // Retorna el estado actual de la sesión de WhatsApp
  fastify.get('/whatsapp/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clinic_id } = req.tenant
    const status = getSessionStatus(clinic_id)
    const qr = getPendingQR(clinic_id)

    return reply.send({
      status,                           // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
      connected: status === 'connected',
      phone: req.tenant.config.wa_phone,
      qr_available: !!qr,
    })
  })

  // ── GET /whatsapp/qr ─────────────────────────────────────
  // Inicia la conexión y retorna el QR como imagen base64 o SVG
  fastify.get('/whatsapp/qr', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clinic_id } = req.tenant
    const status = getSessionStatus(clinic_id)

    // Si ya está conectado, no hacer nada
    if (status === 'connected') {
      return reply.send({
        status: 'already_connected',
        phone: req.tenant.config.wa_phone,
      })
    }

    // Si ya hay un QR pendiente, devolverlo
    let qrString = getPendingQR(clinic_id)

    if (!qrString) {
      // Iniciar sesión y esperar el QR (timeout 30s)
      qrString = await new Promise<string | null>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 30_000)

        // Escuchar el evento de QR para esta clínica específica
        waEvents.once(`qr:${clinic_id}`, (qr: string) => {
          clearTimeout(timeout)
          resolve(qr)
        })

        // Iniciar sesión (esto dispara el evento qr:clinic_id)
        startSession(clinic_id).catch(err => {
          clearTimeout(timeout)
          fastify.log.error(`Error iniciando sesión WA para ${clinic_id}:`, err)
          resolve(null)
        })
      })
    }

    if (!qrString) {
      return reply.status(408).send({
        error: 'Timeout generando QR. Intenta de nuevo.',
      })
    }

    // Convertir a imagen base64 PNG para mostrar en el dashboard
    try {
      const qrDataUrl = await QRCode.toDataURL(qrString, {
        width: 300,
        margin: 2,
        color: { dark: '#0d1a15', light: '#f5f4ef' },
      })

      return reply.send({
        status: 'qr_ready',
        qr_image: qrDataUrl,    // data:image/png;base64,...
        qr_string: qrString,    // para renderizar con librería QR del frontend
        expires_in: 60,         // segundos antes de expirar
      })
    } catch {
      return reply.status(500).send({ error: 'Error generando imagen QR' })
    }
  })

  // ── GET /whatsapp/qr/stream ───────────────────────────────
  // Server-Sent Events: el frontend recibe actualizaciones en tiempo real
  fastify.get('/whatsapp/qr/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clinic_id } = req.tenant

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    // Enviar status inicial
    sendEvent('status', { status: getSessionStatus(clinic_id) })

    // Escuchar cambios de QR
    const onQR = async (qr: string) => {
      const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 })
      sendEvent('qr', { qr_image: qrDataUrl, qr_string: qr })
    }

    // Escuchar cambios de status
    const onStatus = (status: string, phone?: string) => {
      sendEvent('status', { status, phone })
      if (status === 'connected') {
        reply.raw.end()
      }
    }

    waEvents.on(`qr:${clinic_id}`, onQR)
    waEvents.on(`status:${clinic_id}`, onStatus)

    // Iniciar sesión si no está corriendo
    const currentStatus = getSessionStatus(clinic_id)
    if (currentStatus === 'disconnected') {
      startSession(clinic_id).catch(err =>
        fastify.log.error(`Error iniciando sesión:`, err)
      )
    }

    // Limpiar listeners cuando el cliente se desconecta
    req.raw.on('close', () => {
      waEvents.off(`qr:${clinic_id}`, onQR)
      waEvents.off(`status:${clinic_id}`, onStatus)
    })
  })

  // ── POST /whatsapp/disconnect ─────────────────────────────
  fastify.post('/whatsapp/disconnect', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clinic_id } = req.tenant

    await closeSession(clinic_id)

    // Actualizar en DB
    await req.supabase
      .from('clinic_config')
      .update({ wa_connected: false, wa_phone: null, wa_connected_at: null })
      .eq('clinic_id', clinic_id)

    return reply.send({ success: true, message: 'WhatsApp desconectado' })
  })
}
