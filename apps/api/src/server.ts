// ============================================================
//  CELURA · Servidor principal Fastify
// ============================================================

// IMPORTANTE: Sentry debe inicializarse ANTES que cualquier otra
// importación para auto-instrumentar Fastify, Node, HTTP, etc.
import './instrument.js'

import 'dotenv/config'
import { env } from './config/env.js'   // valida el entorno ANTES de cargar el resto
import * as Sentry from '@sentry/node'
import Fastify, { FastifyRequest } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'

import tenantPlugin from './plugins/tenant.js'
import whatsappRoutes from './routes/whatsapp.js'
import onboardingRoutes from './routes/onboarding.js'
import clinicsRoutes from './routes/clinics.js'
import leadsRoutes from './routes/leads.js'
import appointmentsRoutes from './routes/appointments.js'
import conversationsRoutes from './routes/conversations.js'
import { waEvents, restoreAllSessions } from './services/whatsapp.js'
import { processMessage } from './services/brain.js'
import { startFollowUpWorker, shutdownScheduler } from './services/scheduler.js'
import type { WAMessage } from './services/whatsapp.js'

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,        // detrás de Railway/proxy: IP real para rate-limit
    disableRequestLogging: env.NODE_ENV === 'production',
  })

  // ── Seguridad ──────────────────────────────────────────────
  await fastify.register(helmet, {
    contentSecurityPolicy: false,  // el frontend lo maneja
  })

  await fastify.register(cors, {
    origin: env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    credentials: true,
  })

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Demasiadas solicitudes. Espera un momento.',
      statusCode: 429,
    }),
  })

  // ── JWT (ES256 via Supabase JWKS + HS256 fallback) ────────
  const buildGetJwks = (await import('get-jwks')).default
  const getJwks = buildGetJwks({ jwksPath: '/.well-known/jwks.json' })

  await fastify.register(jwt, {
    decode: { complete: true },
    secret: async (_req: FastifyRequest, tokenOrHeader: { header: { kid?: string; alg: string }; payload: { iss?: string } } | { kid?: string; alg: string }): Promise<string | Buffer> => {
      const header = 'header' in tokenOrHeader ? tokenOrHeader.header : tokenOrHeader
      const payload = 'payload' in tokenOrHeader ? tokenOrHeader.payload : undefined
      if (header.alg === 'ES256' && header.kid) {
        return getJwks.getPublicKey({
          kid: header.kid,
          domain: payload?.iss ?? env.SUPABASE_URL + '/auth/v1',
          alg: header.alg,
        })
      }
      return env.JWT_SECRET
    },
    formatUser: (decoded: string | object | Buffer) => {
      if (decoded && typeof decoded === 'object' && 'payload' in decoded)
        return (decoded as { payload: object }).payload
      return decoded
    },
  })

  // ── Plugin de aislamiento por tenant ──────────────────────
  await fastify.register(tenantPlugin)

  // ── Health check (público) ────────────────────────────────
  fastify.get('/health', async () => ({
    status: 'ok',
    version: '1.0.0',
    ts: new Date().toISOString(),
  }))

  // ── Rutas ─────────────────────────────────────────────────
  await fastify.register(onboardingRoutes)                          // /onboarding/*
  await fastify.register(clinicsRoutes, { prefix: '/api' })         // /api/clinics/*
  await fastify.register(leadsRoutes, { prefix: '/api' })           // /api/leads/*
  await fastify.register(conversationsRoutes, { prefix: '/api' })   // /api/conversations + /api/leads/:id/conversation
  await fastify.register(appointmentsRoutes, { prefix: '/api' })    // /api/appointments/*
  await fastify.register(whatsappRoutes, { prefix: '/api' })        // /api/whatsapp/*

  // ── Sentry: instrumentación de Fastify (después de rutas) ──
  Sentry.setupFastifyErrorHandler(fastify)

  // ── 404 consistente ───────────────────────────────────────
  fastify.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ error: 'Ruta no encontrada', path: req.url })
  })

  // ── Error handler global: nunca filtrar stack en producción ─
  fastify.setErrorHandler((error, req, reply) => {
    const status = error.statusCode ?? 500
    if (status >= 500) {
      req.log.error({ err: error }, 'Error no manejado')
      Sentry.captureException(error, {
        tags: { route: req.url, method: req.method },
        extra: { clinic_id: (req as { clinic?: { id?: string } }).clinic?.id },
      })
    } else {
      req.log.warn({ err: error.message }, 'Error de request')
    }
    reply.status(status).send({
      error:
        status >= 500 && env.NODE_ENV === 'production'
          ? 'Error interno del servidor'
          : error.message,
      statusCode: status,
    })
  })

  return fastify
}

async function main() {
  const server = await buildServer()

  // ── Conectar el brain al bus de mensajes de WhatsApp ──────
  // Un fallo procesando un mensaje NUNCA debe tumbar el proceso.
  waEvents.on('message', (msg: WAMessage) => {
    processMessage(msg).catch((err) => {
      server.log.error({ err, clinic: msg.clinic_id }, 'Error procesando mensaje WA')
      Sentry.captureException(err, {
        tags: { source: 'whatsapp_brain' },
        extra: { clinic_id: msg.clinic_id },
      })
    })
  })

  // ── Side-effects de arranque: tolerantes a fallos ─────────
  // Si Redis o el disco fallan, el servidor HTTP igual debe quedar arriba.
  try {
    startFollowUpWorker()
  } catch (err) {
    server.log.error({ err }, 'No se pudo iniciar el worker de seguimientos')
  }

  try {
    await restoreAllSessions()
  } catch (err) {
    server.log.error({ err }, 'No se pudieron restaurar las sesiones de WhatsApp')
  }

  // ── Arrancar servidor ─────────────────────────────────────
  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' })
    server.log.info(`Celura API corriendo en 0.0.0.0:${env.PORT}`)
  } catch (err) {
    server.log.error({ err }, 'No se pudo iniciar el servidor')
    process.exit(1)
  }

  // ── Graceful shutdown ─────────────────────────────────────
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    server.log.info(`${signal} recibido. Cerrando servidor...`)
    try {
      await server.close()
      await shutdownScheduler()
    } catch (err) {
      server.log.error({ err }, 'Error durante el shutdown')
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  // ── Red de seguridad: errores no capturados ───────────────
  process.on('unhandledRejection', (reason) => {
    server.log.error({ reason }, 'Unhandled rejection')
    Sentry.captureException(reason)
  })
  process.on('uncaughtException', (err) => {
    server.log.fatal({ err }, 'Uncaught exception — reiniciando proceso')
    Sentry.captureException(err)
    // Dar tiempo a Sentry para enviar antes de cerrar
    void Sentry.flush(2000).finally(() => shutdown('uncaughtException'))
  })
}

main()
