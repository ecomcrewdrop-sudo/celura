// ============================================================
//  CELURA · Helpers de formato para emails
//  ------------------------------------------------------------
//  Locales y zonas centralizados aquí para que TODAS las
//  plantillas hablen el mismo idioma del paciente / doctor.
// ============================================================

const DEFAULT_LOCALE = 'es-MX'
const DEFAULT_TZ = 'America/Mexico_City'

/**
 * "viernes, 14 de marzo · 10:30 a.m."
 */
export function formatDateTime(
  iso: string | Date,
  opts: { locale?: string; tz?: string } = {},
): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return ''

  const locale = opts.locale ?? DEFAULT_LOCALE
  const tz = opts.tz ?? DEFAULT_TZ

  const dayPart = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(date)

  const timePart = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(date)

  return `${capitalize(dayPart)} · ${timePart}`
}

/**
 * "14 de marzo de 2026"
 */
export function formatDate(
  iso: string | Date,
  opts: { locale?: string; tz?: string } = {},
): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(opts.locale ?? DEFAULT_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: opts.tz ?? DEFAULT_TZ,
  }).format(date)
}

/**
 * "$ 290.00 MXN"
 */
export function formatCurrency(
  amount: number,
  currency: string = 'MXN',
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * "3 días", "1 día", "hoy"
 */
export function daysFromNow(iso: string | Date): {
  days: number
  label: string
} {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return { days: 0, label: 'hoy' }
  const diffMs = date.getTime() - Date.now()
  const days = Math.max(0, Math.ceil(diffMs / 86_400_000))
  if (days === 0) return { days: 0, label: 'hoy' }
  if (days === 1) return { days: 1, label: '1 día' }
  return { days, label: `${days} días` }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Saludo según hora local del doctor.
 */
export function greeting(
  name: string | null | undefined,
  opts: { tz?: string } = {},
): string {
  const tz = opts.tz ?? DEFAULT_TZ
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(
      new Date(),
    ),
    10,
  )
  const part =
    hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  return name ? `${part}, ${name}` : part
}
