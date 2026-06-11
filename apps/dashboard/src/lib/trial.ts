// ============================================================
//  CELURA · Cálculo de días de prueba / trial
//
//  Reglamento (intuitivo para el usuario):
//  • La cuenta se mide en DÍAS CALENDARIO, no en bloques de 24h.
//    Si te registraste ayer (no importa la hora), hoy te quedan 13.
//  • El día actual NO se cuenta como "restante" — lo que muestra el
//    contador es "cuántos días más después de hoy".
//  • Si el trial vence hoy → "Termina hoy".
//  • Si ya pasó → "Tu acceso ha terminado".
// ============================================================

const DAY_MS = 86_400_000

/**
 * Días calendario que faltan entre HOY (local) y la fecha de fin del trial.
 * Si te registraste el día 1 a cualquier hora con trial de 14 días,
 * trial_ends_at = día 15 → el día 1 verás 14, el día 2 verás 13, …, el día 15 verás 0.
 */
export function trialDaysLeft(iso: string | null | undefined): number | null {
  if (!iso) return null
  const end = new Date(iso)
  if (Number.isNaN(end.getTime())) return null
  const now = new Date()

  // Normalizar a medianoche LOCAL de cada fecha para evitar drift por hora del registro.
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((endDay - nowDay) / DAY_MS)
  return Math.max(0, diff)
}

/**
 * Total de días del período de prueba (para barras de progreso).
 * Si tienes la fecha de inicio del beta/trial úsala; si no, asumimos 14.
 */
export function trialTotalDays(startedAtIso: string | null | undefined, endsAtIso: string | null | undefined, fallback = 14): number {
  if (!startedAtIso || !endsAtIso) return fallback
  const start = new Date(startedAtIso)
  const end = new Date(endsAtIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return fallback
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  const diff = Math.round((endDay - startDay) / DAY_MS)
  return diff > 0 ? diff : fallback
}

/** Etiqueta legible: "13 días restantes" / "Termina mañana" / "Termina hoy" / "Tu acceso ha terminado". */
export function trialLabel(iso: string | null | undefined): string {
  const d = trialDaysLeft(iso)
  if (d === null) return ''
  if (d <= 0) {
    // Si la fecha de fin ya pasó del todo, distinguimos.
    if (iso && new Date(iso).getTime() < Date.now()) return 'Tu acceso ha terminado'
    return 'Termina hoy'
  }
  if (d === 1) return 'Termina mañana'
  return `${d} días restantes`
}
