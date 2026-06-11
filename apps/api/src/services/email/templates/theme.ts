// ============================================================
//  CELURA · Sistema de diseño de email (tokens)
//  ------------------------------------------------------------
//  Esta es la fuente de verdad visual de TODO email transaccional
//  de Celura. Tokens curados para:
//   • Premium feel sin perder deliverability (Gmail, iOS Mail, Outlook).
//   • Identidad lime de Celura usada con intención, no de relleno.
//   • Tipografía con peso y tracking decididos (no defaults).
// ============================================================

export const theme = {
  // ── Acento Celura ──────────────────────────────────────
  // El lime no es decorativo: marca *dónde mirar*. Limitado a:
  // hero halo, ribbon superior, números de pasos, CTA principal,
  // y un par de KPIs. Si se usa en más sitios, pierde fuerza.
  lime050: '#EEFBF4',
  lime100: '#D6F5E5',
  lime200: '#A9EBCB',
  lime300: '#8FE5CA',
  lime400: '#5DCAA5',
  lime500: '#4AB892',
  lime600: '#3A9B7A',
  lime700: '#2C7B60',

  // Gradientes precomputados — los inlineamos como strings.
  // El de "soft" se usa para halos y backgrounds; el "bold" para CTAs.
  gradientSoft:
    'linear-gradient(135deg, rgba(143,229,202,0.28) 0%, rgba(93,202,165,0.08) 60%, rgba(255,255,255,0) 100%)',
  gradientBold:
    'linear-gradient(135deg, #5DCAA5 0%, #4AB892 100%)',
  gradientBoldHover:
    'linear-gradient(135deg, #4AB892 0%, #3A9B7A 100%)',
  gradientRibbon:
    'linear-gradient(90deg, rgba(143,229,202,0) 0%, #8FE5CA 22%, #5DCAA5 50%, #8FE5CA 78%, rgba(143,229,202,0) 100%)',

  // ── Dark (para hero opcional) ──────────────────────────
  dark950: '#06060a',
  dark900: '#09090b',
  dark800: '#0c0c10',

  // ── Light palette (cuerpo principal) ──────────────────
  // Background pizarra MUY clara — más cálido que un blanco puro,
  // se distingue del white de la card y crea profundidad.
  bg: '#F5F6F8',
  card: '#FFFFFF',
  cardSoft: '#FAFAFB',
  cardWarm: '#F8FAF9',     // tarjetas con tinte lime sutil
  border: '#E6E8EE',
  borderSoft: '#EEF0F5',

  // ── Texto ──────────────────────────────────────────────
  text: '#0B0C10',         // titulos — casi negro, no #000 puro
  textBody: '#3F4250',     // párrafos
  textMuted: '#5C606E',    // párrafos secundarios
  textDim: '#8A8E9C',      // labels, footer
  textOnAccent: '#0B2D22', // texto sobre fondo lime (legible)

  // ── Severidades (uso muy reservado) ────────────────────
  amber: '#E08A3C',
  amberSoft: '#FFF4E5',
  rose: '#E5484D',
  roseSoft: '#FFEFEF',

  // ── Tipografía ─────────────────────────────────────────
  // Stack ultra-segura: -apple-system para iOS Mail, Segoe para
  // Outlook, Inter al frente si el cliente la trae (Apple Mail web).
  font:
    "-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontMono:
    "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",

  // ── Geometría ──────────────────────────────────────────
  radiusXl: 20,
  radiusLg: 16,
  radiusMd: 12,
  radiusSm: 8,
  radiusPill: 999,

  // Sombras (clientes que las respetan: Apple Mail, Gmail web)
  shadowSoft: '0 2px 8px rgba(11,12,16,0.04), 0 1px 2px rgba(11,12,16,0.04)',
  shadowMd: '0 10px 30px rgba(11,12,16,0.06), 0 3px 8px rgba(11,12,16,0.04)',
  shadowGlow: '0 10px 30px rgba(74,184,146,0.22), 0 4px 12px rgba(74,184,146,0.18)',
} as const

/**
 * Wordmark "celura" — lockup canónico en texto.
 * Decisión consciente: usamos texto (no imagen) para que cargue
 * siempre y respete cualquier dark mode del cliente.
 *
 *  • Peso 800 + tracking negativo (-0.025em): da el "punch" del logo
 *  • El punto/acento opcional refuerza la marca (• en lime)
 */
export function wordmark(opts?: {
  color?: string
  size?: number
  withDot?: boolean
  dotColor?: string
}): string {
  const color = opts?.color ?? theme.text
  const size = opts?.size ?? 22
  const dotColor = opts?.dotColor ?? theme.lime400
  const dot = opts?.withDot
    ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor};margin-left:6px;vertical-align:middle;line-height:1px;font-size:1px;">&nbsp;</span>`
    : ''
  return `<span style="font-family:${theme.font};font-weight:800;letter-spacing:-0.025em;font-size:${size}px;color:${color};line-height:1;">celura${dot ? '' : ''}</span>${dot}`
}

/** Alias compatible con la implementación previa. */
export const logoLockup = wordmark
