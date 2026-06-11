// ============================================================
//  CELURA · Componentes premium de email
//  ------------------------------------------------------------
//  Cada función devuelve HTML inline-styled. Tres niveles:
//   1. PRIMITIVOS  · h1, h2, p, small, divider, spacer
//   2. BLOQUES     · hero, eyebrow, numberedSteps, statBig, statRow
//   3. INTERACT.   · button (gradient/ghost), badge, card, row, kpi
// ============================================================

import { theme } from './theme.js'
import { esc } from './layout.js'

// ──────────────────────────────────────────────────────────
//  1. PRIMITIVOS
// ──────────────────────────────────────────────────────────

/** Eyebrow — pequeño label uppercase encima del H1. La firma editorial. */
export function eyebrow(text: string, color: string = theme.lime600): string {
  return `<div class="celura-eyebrow" style="font-family:${theme.font};font-size:11.5px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${color};margin:0 0 14px 0;line-height:1;">${esc(text)}</div>`
}

/** Título principal — uno por email. 30px desktop, 26px mobile. */
export function h1(text: string): string {
  return `<h1 class="celura-h1" style="margin:0 0 14px 0;font-family:${theme.font};font-size:30px;line-height:1.16;font-weight:700;letter-spacing:-0.025em;color:${theme.text};">${esc(text)}</h1>`
}

/** Variante h1 con acento de color en una palabra clave (HTML pre-rendereado). */
export function h1Rich(html: string): string {
  return `<h1 class="celura-h1" style="margin:0 0 14px 0;font-family:${theme.font};font-size:30px;line-height:1.16;font-weight:700;letter-spacing:-0.025em;color:${theme.text};">${html}</h1>`
}

/** Subtítulo de sección. */
export function h2(text: string): string {
  return `<h2 class="celura-h2" style="margin:28px 0 12px 0;font-family:${theme.font};font-size:18px;line-height:1.32;font-weight:700;letter-spacing:-0.015em;color:${theme.text};">${esc(text)}</h2>`
}

/** Párrafo regular. Acepta HTML para énfasis y enlaces. */
export function p(html: string): string {
  return `<p style="margin:0 0 16px 0;font-family:${theme.font};font-size:15.5px;line-height:1.65;color:${theme.textBody};font-weight:400;">${html}</p>`
}

/** Lead paragraph — el primero, un poco más grande. */
export function lead(html: string): string {
  return `<p style="margin:0 0 22px 0;font-family:${theme.font};font-size:16.5px;line-height:1.62;color:${theme.textBody};font-weight:400;">${html}</p>`
}

/** Texto pequeño / nota al pie. */
export function small(html: string): string {
  return `<p style="margin:14px 0 0 0;font-family:${theme.font};font-size:12.5px;line-height:1.6;color:${theme.textDim};font-weight:400;">${html}</p>`
}

/** Divider sutil. */
export function divider(): string {
  return `<div style="height:1px;background:${theme.border};margin:28px 0;line-height:1px;font-size:1px;">&nbsp;</div>`
}

/** Divider editorial: línea + punto lime + línea (centrado). */
export function dividerOrnament(): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
    <tr>
      <td align="center">
        <div style="display:inline-block;height:1px;width:60px;background:${theme.border};line-height:1px;font-size:1px;vertical-align:middle;">&nbsp;</div>
        <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${theme.lime400};margin:0 12px;vertical-align:middle;line-height:1px;font-size:1px;">&nbsp;</span>
        <div style="display:inline-block;height:1px;width:60px;background:${theme.border};line-height:1px;font-size:1px;vertical-align:middle;">&nbsp;</div>
      </td>
    </tr>
  </table>`
}

/** Espaciado vertical explícito en px. */
export function spacer(h: number = 16): string {
  return `<div style="height:${h}px;line-height:${h}px;font-size:1px;">&nbsp;</div>`
}

// ──────────────────────────────────────────────────────────
//  2. BLOQUES
// ──────────────────────────────────────────────────────────

/**
 * Hero combinado: eyebrow opcional + título + lead.
 * Es la fórmula "premium SaaS" — eyebrow da contexto, título empuja,
 * lead respira.
 */
export function hero(opts: {
  eyebrow?: string
  /** Texto plano del título (se escapa). Opcional si pasas `titleHtml`. */
  title?: string
  /** Permite poner una palabra en lime con `accent('palabra')` dentro. */
  titleHtml?: string
  lead?: string
  /** HTML pre-rendereado para lead con énfasis. */
  leadHtml?: string
}): string {
  const parts: string[] = []
  if (opts.eyebrow) parts.push(eyebrow(opts.eyebrow))
  if (opts.titleHtml) parts.push(h1Rich(opts.titleHtml))
  else if (opts.title) parts.push(h1(opts.title))
  if (opts.leadHtml) parts.push(lead(opts.leadHtml))
  else if (opts.lead) parts.push(lead(esc(opts.lead)))
  return parts.join('')
}

/** Subraya una palabra/frase con el lime — para usar dentro de h1Rich/leadHtml. */
export function accent(html: string, color: string = theme.lime500): string {
  return `<span style="color:${color};">${html}</span>`
}

/**
 * Pasos numerados — el patrón "onboarding premium".
 * Pelotita lime con número + bloque a la derecha con título y body.
 */
export function numberedSteps(
  steps: { title: string; body: string }[],
): string {
  const rows = steps
    .map(
      (s, i) => `
    <tr>
      <td valign="top" width="44" style="padding:0 16px 18px 0;">
        <div style="width:32px;height:32px;border-radius:50%;background:${theme.lime400};background-image:${theme.gradientBold};text-align:center;line-height:32px;font-family:${theme.font};font-size:14px;font-weight:700;color:${theme.textOnAccent};box-shadow:${theme.shadowGlow};">${i + 1}</div>
      </td>
      <td valign="top" style="padding:0 0 18px 0;">
        <div style="font-family:${theme.font};font-size:15.5px;font-weight:600;color:${theme.text};line-height:1.4;margin-bottom:3px;">${esc(s.title)}</div>
        <div style="font-family:${theme.font};font-size:14.5px;font-weight:400;color:${theme.textMuted};line-height:1.55;">${s.body}</div>
      </td>
    </tr>`,
    )
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0 8px 0;">${rows}</table>`
}

/**
 * Stat display gigante — para "el número del día".
 * Úsalo cuando un solo número importa más que todo el resto.
 */
export function statBig(opts: {
  value: string | number
  label: string
  helper?: string
}): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 18px 0;">
    <tr>
      <td>
        <div class="celura-stat" style="font-family:${theme.font};font-size:48px;line-height:1;font-weight:800;letter-spacing:-0.04em;color:${theme.text};">${esc(opts.value)}</div>
        <div style="font-family:${theme.font};font-size:11.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${theme.textDim};margin-top:8px;">${esc(opts.label)}</div>
        ${opts.helper ? `<div style="font-family:${theme.font};font-size:13px;color:${theme.textMuted};margin-top:6px;line-height:1.5;">${opts.helper}</div>` : ''}
      </td>
    </tr>
  </table>`
}

/**
 * Fila horizontal de 2-3 KPIs compactos — "dashboard inline".
 * Cada celda colapsa a full-width en mobile.
 */
export function statRow(cells: { value: string | number; label: string }[]): string {
  const tds = cells
    .map(
      (c) => `
      <td class="celura-kpi-cell" width="33%" valign="top" style="padding:0 6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.cardSoft};border:1px solid ${theme.borderSoft};border-radius:${theme.radiusMd}px;">
          <tr>
            <td style="padding:18px 18px 16px 18px;font-family:${theme.font};">
              <div style="font-size:26px;font-weight:800;letter-spacing:-0.025em;color:${theme.text};line-height:1;">${esc(c.value)}</div>
              <div style="margin-top:6px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${theme.textDim};">${esc(c.label)}</div>
            </td>
          </tr>
        </table>
      </td>`,
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px -6px 18px -6px;"><tr>${tds}</tr></table>`
}

// ──────────────────────────────────────────────────────────
//  3. INTERACTIVOS Y CONTENEDORES
// ──────────────────────────────────────────────────────────

/**
 * Botón CTA — gradient lime con sombra glow. Bulletproof Outlook (VML).
 * `variant: 'ghost'` para CTAs secundarios.
 */
export function button(
  label: string,
  href: string,
  variant: 'primary' | 'ghost' = 'primary',
): string {
  const isPrimary = variant === 'primary'
  const bg = isPrimary ? theme.lime500 : theme.card
  const fg = isPrimary ? theme.textOnAccent : theme.text
  const border = isPrimary ? theme.lime500 : theme.border
  const gradient = isPrimary ? theme.gradientBold : 'none'
  const shadow = isPrimary ? theme.shadowGlow : theme.shadowSoft

  // VML: Outlook desktop necesita esto para rendear el botón con border-radius y color.
  const vml = `
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
    href="${esc(href)}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="50%"
    strokecolor="${border}" fillcolor="${bg}">
    <w:anchorlock/>
    <center style="color:${fg};font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:-0.005em;">${esc(label)}</center>
  </v:roundrect>
  <![endif]-->`

  const html = `
  <!--[if !mso]><!-- -->
  <a class="celura-btn" href="${esc(href)}"
     style="display:inline-block;background:${bg};background-image:${gradient};color:${fg};font-family:${theme.font};font-size:15px;font-weight:700;line-height:1;text-decoration:none;padding:16px 30px;border-radius:${theme.radiusPill}px;border:1px solid ${border};letter-spacing:-0.005em;box-shadow:${shadow};">
    ${esc(label)}
  </a>
  <!--<![endif]-->`

  return `<div style="margin:24px 0 6px 0;">${vml}${html}</div>`
}

/** Link de texto secundario debajo del botón principal. */
export function textLink(label: string, href: string): string {
  return `<div style="margin:10px 0 6px 0;font-family:${theme.font};font-size:14px;line-height:1.5;">
    <a href="${esc(href)}" style="color:${theme.lime600};font-weight:600;text-decoration:none;">${esc(label)} <span style="display:inline-block;margin-left:2px;">→</span></a>
  </div>`
}

/**
 * Card secundaria — para destacar info clave (cita, monto, fecha).
 * `accent` añade una barra de color superior; `tint='warm'` da
 * tinte lime sutil al fondo (úsalo en momentos celebratorios).
 */
export function card(
  inner: string,
  opts?: { accent?: string; tint?: 'soft' | 'warm' | 'amber' | 'rose' },
): string {
  const tint = opts?.tint ?? 'soft'
  const bg =
    tint === 'warm'
      ? theme.cardWarm
      : tint === 'amber'
        ? theme.amberSoft
        : tint === 'rose'
          ? theme.roseSoft
          : theme.cardSoft
  const accentBar = opts?.accent
    ? `<div style="height:3px;background:${opts.accent};background-image:${theme.gradientRibbon};line-height:3px;font-size:1px;">&nbsp;</div>`
    : ''
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;background:${bg};border:1px solid ${theme.borderSoft};border-radius:${theme.radiusLg}px;overflow:hidden;">
    <tr><td style="padding:0;">${accentBar}</td></tr>
    <tr>
      <td style="padding:22px 24px;font-family:${theme.font};color:${theme.text};">
        ${inner}
      </td>
    </tr>
  </table>`
}

/**
 * Fila clave/valor dentro de una card. El label arriba (uppercase),
 * el valor abajo en peso 600.
 */
export function row(label: string, value: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;">
    <tr>
      <td style="font-family:${theme.font};font-size:11px;line-height:1.4;color:${theme.textDim};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;padding-bottom:3px;">${esc(label)}</td>
    </tr>
    <tr>
      <td style="font-family:${theme.font};font-size:15.5px;line-height:1.5;color:${theme.text};font-weight:600;letter-spacing:-0.005em;">${value}</td>
    </tr>
  </table>`
}

/** Compat: KPI estilo viejo (inline). Mantiene firma para no romper plantillas existentes. */
export function kpi(value: string | number, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:6px 12px 6px 0;background:${theme.cardSoft};border:1px solid ${theme.borderSoft};border-radius:${theme.radiusMd}px;">
    <tr>
      <td style="padding:14px 18px;font-family:${theme.font};text-align:left;">
        <div style="font-size:24px;font-weight:800;color:${theme.text};line-height:1;letter-spacing:-0.025em;">${esc(value)}</div>
        <div style="margin-top:5px;font-size:11px;color:${theme.textDim};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">${esc(label)}</div>
      </td>
    </tr>
  </table>`
}

/**
 * Bullets refinados — bullet pill lime + texto.
 * Más "Linear" que el típico disc bullet.
 */
export function bullets(items: string[]): string {
  const rows = items
    .map(
      (it) => `
    <tr>
      <td valign="top" width="22" style="padding:8px 10px 8px 0;">
        <div style="width:8px;height:8px;border-radius:50%;background:${theme.lime400};margin-top:8px;line-height:1px;font-size:1px;">&nbsp;</div>
      </td>
      <td style="font-family:${theme.font};font-size:15px;line-height:1.6;color:${theme.textBody};padding:5px 0;">${it}</td>
    </tr>`,
    )
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 16px 0;">${rows}</table>`
}

/**
 * Badge — pill chiquito para etiquetar estados.
 * Variants:
 *  - 'lime' (default), 'amber', 'rose', 'neutral', 'dark'
 */
export function badge(
  label: string,
  variant: 'lime' | 'amber' | 'rose' | 'neutral' | 'dark' = 'lime',
): string {
  const palette = {
    lime: { bg: theme.lime050, fg: theme.lime700, border: theme.lime200 },
    amber: { bg: theme.amberSoft, fg: '#9A5A1F', border: '#FAD8A6' },
    rose: { bg: theme.roseSoft, fg: '#A33136', border: '#F5BDBF' },
    neutral: { bg: theme.cardSoft, fg: theme.textMuted, border: theme.border },
    dark: { bg: theme.dark900, fg: theme.lime300, border: theme.dark800 },
  }[variant]
  return `<span style="display:inline-block;padding:5px 11px;font-family:${theme.font};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${palette.fg};background:${palette.bg};border:1px solid ${palette.border};border-radius:99px;line-height:1.3;">${esc(label)}</span>`
}

/**
 * Status dot — punto de color con label inline (para "🟢 En línea" etc.)
 * sin emoji (Outlook los rendea raros).
 */
export function statusDot(label: string, color: string = theme.lime400): string {
  return `<span style="display:inline-flex;align-items:center;font-family:${theme.font};">
    <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};margin-right:8px;vertical-align:middle;line-height:1px;font-size:1px;box-shadow:0 0 0 3px ${color}22;">&nbsp;</span>
    <span style="font-size:14px;font-weight:600;color:${theme.text};vertical-align:middle;">${esc(label)}</span>
  </span>`
}

/**
 * Quote — testimonial, snippet, recordatorio importante.
 * Borde izquierdo lime + texto cursiva sutil.
 */
export function quote(text: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
    <tr>
      <td style="border-left:3px solid ${theme.lime400};padding:6px 0 6px 18px;font-family:${theme.font};font-size:15px;line-height:1.6;color:${theme.textBody};font-style:italic;">
        ${esc(text)}
      </td>
    </tr>
  </table>`
}
