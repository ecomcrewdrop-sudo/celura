// ============================================================
//  CELURA · Validación de variables de entorno
//  Se valida UNA VEZ al arrancar. Si algo falta o es inválido,
//  el servidor no arranca y muestra exactamente qué corregir.
// ============================================================

import 'dotenv/config'
import { z } from 'zod'

const placeholder = (v: string) =>
  !v.startsWith('PENDIENTE') && !v.includes('xxxxxxxx') && !v.includes('here')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  SUPABASE_URL: z.string().url().refine(placeholder, 'falta el valor real'),
  SUPABASE_ANON_KEY: z.string().min(20).refine(placeholder, 'falta el valor real'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20)
    .refine(placeholder, 'falta el valor real'),

  JWT_SECRET: z.string().min(20).refine(placeholder, 'falta el valor real'),

  // 32 bytes en hex = 64 caracteres
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'debe ser 64 caracteres hexadecimales (32 bytes)'),

  REDIS_URL: z.string().min(1).refine(placeholder, 'falta el valor real'),

  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  WA_SESSIONS_PATH: z.string().default('./sessions'),
  API_URL: z.string().optional(),

  // Sentry (opcional: si no está, error tracking se desactiva con un warning)
  SENTRY_DSN: z.string().url().optional(),

  // ── Emails (Resend) ─────────────────────────────────────
  // Si RESEND_API_KEY no está, el mailer queda en modo "dry-run":
  // registra el intento en email_log con status=skipped y NO lanza.
  // Esto permite trabajar en local sin claves reales.
  RESEND_API_KEY: z
    .string()
    .min(10)
    .refine(placeholder, 'falta el valor real')
    .optional(),
  RESEND_FROM: z
    .string()
    .default('Celura <hola@celura.clinic>'),
  RESEND_REPLY_TO: z.string().email().optional(),
  DASHBOARD_URL: z
    .string()
    .url()
    .default('https://app.celura.clinic'),
  BRAND_NAME: z.string().default('Celura'),
  SUPPORT_EMAIL: z.string().email().default('hola@celura.clinic'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ✗ ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  // eslint-disable-next-line no-console
  console.error(
    `\n[Celura] Configuración de entorno inválida. Revisa tu .env:\n${issues}\n`
  )
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env

// Aviso (no fatal) si en producción se apunta a Redis local
if (env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(env.REDIS_URL)) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Celura] ADVERTENCIA: REDIS_URL apunta a localhost en producción. ' +
      'Los seguimientos no funcionarán sin un Redis accesible.'
  )
}
