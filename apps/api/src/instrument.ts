// ============================================================
//  CELURA · Inicialización de Sentry
//  Debe importarse ANTES que cualquier otro módulo de la app
//  para que la auto-instrumentación de Fastify funcione.
// ============================================================

import 'dotenv/config'
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA ?? '1.0.0',

    integrations: [nodeProfilingIntegration()],

    // Performance — bajamos sampling fuera de dev para no quemar cuota
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    profileSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    profileLifecycle: 'trace',

    // Logs estructurados a Sentry
    enableLogs: true,

    // Nunca enviar bodies con PII de pacientes a Sentry
    sendDefaultPii: false,
  })
} else {
  // eslint-disable-next-line no-console
  console.warn('[Sentry] SENTRY_DSN no configurado — error tracking desactivado')
}
