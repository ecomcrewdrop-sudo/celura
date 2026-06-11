// ============================================================
//  CELURA · Plantillas: trial por vencer + pago pendiente
//  ------------------------------------------------------------
//  Diseño 10/10:
//   • Stat display: el número de días/monto manda visualmente
//   • Eyebrow editorial dirige tono (RECORDATORIO, ACCIÓN REQUERIDA)
//   • Card con tinte ámbar si urge (T-1 o T-0)
//   • CTA gradient con copy directo, sin ansiedad
// ============================================================

import { env } from '../../../config/env.js'
import { renderLayout, renderTextLayout, esc } from './layout.js'
import {
  hero,
  p,
  h2,
  button,
  textLink,
  card,
  row,
  statBig,
  bullets,
  badge,
  spacer,
  small,
  dividerOrnament,
  accent,
} from './components.js'
import { theme } from './theme.js'
import { formatDate, formatCurrency, daysFromNow } from './format.js'
import type { ClinicSummary, RenderedEmail } from '../types.js'

export interface TrialEndingInput {
  ownerName?: string | null
  clinic: ClinicSummary
  trialEndsAt: string
  isBeta?: boolean
}

export function renderTrialEnding(input: TrialEndingInput): RenderedEmail {
  const name = (input.ownerName?.trim() || '').split(' ')[0] || 'doctor/a'
  const { days, label } = daysFromNow(input.trialEndsAt)
  const trialDate = formatDate(input.trialEndsAt)
  const billingLink = `${env.DASHBOARD_URL}/dashboard/billing`
  const isUrgent = days <= 1
  const tint: 'amber' | 'warm' = isUrgent ? 'amber' : 'warm'
  const accentColor = isUrgent ? theme.amber : theme.lime400

  const subject =
    days === 0
      ? `Tu plan vence HOY · ${esc(input.clinic.name)}`
      : days === 1
        ? `Mañana vence tu plan en Celura`
        : `Quedan ${label} de tu plan en Celura`

  const eyebrowText = isUrgent ? 'Acción requerida' : 'Recordatorio'

  const inner = `
    ${hero({
      eyebrow: eyebrowText,
      titleHtml:
        days === 0
          ? `Tu plan vence ${accent('hoy', theme.amber)}, ${esc(name)}`
          : days === 1
            ? `Mañana ${accent('termina tu acceso', theme.amber)}`
            : `Quedan ${accent(label)} de tu plan`,
      leadHtml: input.isBeta
        ? `Tu acceso PRO del programa beta termina el <strong style="color:${theme.text};font-weight:600;">${esc(trialDate)}</strong>. Para que tu asistente siga atendiendo a <strong style="color:${theme.text};font-weight:600;">${esc(input.clinic.name)}</strong> sin interrupciones, activa tu plan.`
        : `Tu prueba sin costo termina el <strong style="color:${theme.text};font-weight:600;">${esc(trialDate)}</strong>. Para que tu asistente siga atendiendo a <strong style="color:${theme.text};font-weight:600;">${esc(input.clinic.name)}</strong>, activa tu plan.`,
    })}

    ${statBig({
      value: days === 0 ? 'Hoy' : days,
      label: days === 0 ? 'Vence hoy' : days === 1 ? 'Día restante' : 'Días restantes',
      helper: `Vence el ${esc(trialDate)}.`,
    })}

    ${card(
      `
      ${row('Tu clínica', esc(input.clinic.name))}
      ${row(
        'Plan actual',
        input.isBeta ? badge('Beta · PRO', 'lime') : badge('Trial', 'lime'),
      )}
      ${row('Vence el', `<span style="font-variant-numeric:tabular-nums;">${esc(trialDate)}</span>`)}
    `,
      { tint, accent: accentColor },
    )}

    ${h2('Si activas tu plan antes del vencimiento')}
    ${bullets([
      'Tu asistente sigue conectada a WhatsApp <strong>sin cortes</strong>.',
      'Conservas tu historial de conversaciones y pacientes.',
      'Mantienes los seguimientos automáticos en curso.',
    ])}

    ${spacer(4)}
    ${button('Activar mi plan', billingLink)}
    ${textLink('o ver detalles del plan', billingLink)}

    ${dividerOrnament()}
    ${small(
      `¿Dudas sobre los planes o quieres una extensión? Responde este correo y un humano de Celura te contesta. <strong style="color:${theme.textBody};">Sin bots.</strong>`,
    )}
  `

  const html = renderLayout(inner, {
    accent: accentColor,
    preheader: `Tu plan vence ${days === 0 ? 'hoy' : 'en ' + label}. Activa tu suscripción para mantener tu asistente conectada.`,
    footerNote:
      'Recibes este aviso porque tu prueba está por vencer. Solo enviamos hasta 3 recordatorios.',
  })

  const text = renderTextLayout(
    [
      `${eyebrowText.toUpperCase()}`,
      ``,
      days === 0
        ? `${name}, tu plan vence HOY.`
        : `${name}, quedan ${label} de tu plan en Celura.`,
      ``,
      `Tu plan vence el ${trialDate}.`,
      `Para que tu asistente siga atendiendo a "${input.clinic.name}", activa tu plan:`,
      ``,
      billingLink,
      ``,
      `Si tienes dudas, responde este correo.`,
    ].join('\n'),
  )

  return { subject, html, text }
}

// ────────────────────────────────────────────────────────
//  Pago pendiente
// ────────────────────────────────────────────────────────
export interface PaymentPendingInput {
  ownerName?: string | null
  clinic: ClinicSummary
  amount: number
  currency?: string
  dueAt: string
  paymentUrl?: string
  invoiceNumber?: string
}

export function renderPaymentPending(input: PaymentPendingInput): RenderedEmail {
  const name = (input.ownerName?.trim() || '').split(' ')[0] || 'doctor/a'
  const dueDate = formatDate(input.dueAt)
  const amount = formatCurrency(input.amount, input.currency ?? 'MXN')
  const billingLink = input.paymentUrl ?? `${env.DASHBOARD_URL}/dashboard/billing`
  const { days } = daysFromNow(input.dueAt)
  const isUrgent = days <= 1
  const accentColor = isUrgent ? theme.amber : theme.lime400
  const tint: 'amber' | 'warm' = isUrgent ? 'amber' : 'warm'

  const subject = input.invoiceNumber
    ? `Pago pendiente · Factura ${esc(input.invoiceNumber)}`
    : `Tienes un pago pendiente en Celura`

  const inner = `
    ${hero({
      eyebrow: 'Pago pendiente',
      titleHtml: `${esc(name)}, te queda un ${accent('pago por confirmar')}`,
      leadHtml: `Para que tu plan en <strong style="color:${theme.text};font-weight:600;">${esc(input.clinic.name)}</strong> siga activo, te dejamos los datos del cobro abierto.`,
    })}

    ${statBig({
      value: amount,
      label: 'Monto pendiente',
      helper: `Vence el ${esc(dueDate)}${input.invoiceNumber ? ` · Factura ${esc(input.invoiceNumber)}` : ''}.`,
    })}

    ${card(
      `
      ${row('Clínica', esc(input.clinic.name))}
      ${row('Monto', `<span style="font-variant-numeric:tabular-nums;font-weight:700;">${esc(amount)}</span>`)}
      ${row('Vencimiento', `<span style="font-variant-numeric:tabular-nums;">${esc(dueDate)}</span>`)}
      ${input.invoiceNumber ? row('Factura', `<span style="font-family:${theme.fontMono};font-size:14px;color:${theme.textBody};">${esc(input.invoiceNumber)}</span>`) : ''}
    `,
      { tint, accent: accentColor },
    )}

    ${spacer(2)}
    ${button('Pagar ahora', billingLink)}

    ${dividerOrnament()}
    ${small(
      'Si ya hiciste el pago, ignora este mensaje. A veces tarda hasta 1 hora en reflejarse.',
    )}
  `

  const html = renderLayout(inner, {
    accent: accentColor,
    preheader: `Pago pendiente: ${amount}. Vence el ${dueDate}.`,
  })

  const text = renderTextLayout(
    [
      `PAGO PENDIENTE`,
      ``,
      `${name},`,
      ``,
      `Tu plan de "${input.clinic.name}" tiene un pago pendiente:`,
      `  Monto:        ${amount}`,
      `  Vence:        ${dueDate}`,
      input.invoiceNumber ? `  Factura:      ${input.invoiceNumber}` : '',
      ``,
      `Pagar ahora: ${billingLink}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  return { subject, html, text }
}
