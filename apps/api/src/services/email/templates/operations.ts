// ============================================================
//  CELURA · Plantillas operativas para el doctor
//  ------------------------------------------------------------
//  Diseño 10/10:
//   • wa_connected   → eyebrow "ASISTENTE EN LÍNEA", statusDot lime,
//                      bullets "qué hace sola" + CTA gradient
//   • wa_disconnected→ eyebrow "ACCIÓN REQUERIDA" en amber, card amber,
//                      CTA "Reconectar WhatsApp" + ayuda humana
//   • daily_summary  → eyebrow con saludo, statRow con 3 KPIs,
//                      statBig cuando hay citas hoy, highlights bullets
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
  bullets,
  statBig,
  statRow,
  statusDot,
  spacer,
  small,
  dividerOrnament,
  accent,
} from './components.js'
import { theme } from './theme.js'
import { formatDate, greeting } from './format.js'
import type { ClinicSummary, RenderedEmail } from '../types.js'

// ────────────────────────────────────────────────────────
//  WhatsApp conectado
// ────────────────────────────────────────────────────────
export interface WaConnectedInput {
  ownerName?: string | null
  clinic: ClinicSummary
  /** Número conectado, ej "+52155…". */
  phone?: string | null
}

export function renderWaConnected(input: WaConnectedInput): RenderedEmail {
  const name = (input.ownerName?.trim() || '').split(' ')[0] || 'doctor/a'
  const phone = input.phone ?? ''
  const link = `${env.DASHBOARD_URL}/dashboard/conversations`
  const settingsLink = `${env.DASHBOARD_URL}/dashboard/settings`

  const subject = `Tu asistente está en línea · ${esc(input.clinic.name)}`

  const inner = `
    ${hero({
      eyebrow: 'Asistente en línea',
      titleHtml: `${esc(name)}, tu asistente ${accent('ya está atendiendo')}`,
      leadHtml: `Acabas de conectar WhatsApp a <strong style="color:${theme.text};font-weight:600;">${esc(input.clinic.name)}</strong>. Desde ahora, cada mensaje que llegue se contesta con la calidez de tu clínica — <strong style="color:${theme.text};font-weight:600;">24/7</strong>.`,
    })}

    ${card(
      `
      <div style="margin-bottom:10px;">${statusDot('En línea', theme.lime400)}</div>
      ${row('Clínica', esc(input.clinic.name))}
      ${phone ? row('Número conectado', `<span style="font-variant-numeric:tabular-nums;font-family:${theme.fontMono};font-size:14.5px;color:${theme.textBody};">${esc(phone)}</span>`) : ''}
    `,
      { tint: 'warm', accent: theme.lime400 },
    )}

    ${h2('Qué hace tu asistente, sola')}
    ${bullets([
      'Saluda y entiende el motivo del paciente.',
      'Resuelve dudas frecuentes con el tono que elegiste.',
      'Agenda citas y te pasa el caso si detecta una <strong>urgencia</strong>.',
      'Hace seguimientos automáticos a las <strong>24h, 7 días y 1 mes</strong>.',
    ])}

    ${spacer(4)}
    ${button('Ver conversaciones', link)}
    ${textLink('o ajustar el tono de la asistente', settingsLink)}

    ${dividerOrnament()}
    ${small(`Si en algún momento quieres apagarla, lo haces desde el panel — sin esperas.`)}
  `

  const html = renderLayout(inner, {
    preheader: `WhatsApp conectado. Tu asistente ya está respondiendo en automático.`,
  })

  const text = renderTextLayout(
    [
      `ASISTENTE EN LÍNEA`,
      ``,
      `${name}, tu asistente ya está atendiendo en "${input.clinic.name}".`,
      phone ? `Número conectado: ${phone}` : '',
      ``,
      `Qué hace sola:`,
      `  • Saluda y entiende el motivo.`,
      `  • Resuelve dudas frecuentes.`,
      `  • Agenda citas y te avisa urgencias.`,
      `  • Hace seguimientos a 24h, 7d y 1m.`,
      ``,
      `Ver conversaciones: ${link}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  return { subject, html, text }
}

// ────────────────────────────────────────────────────────
//  WhatsApp desconectado
// ────────────────────────────────────────────────────────
export interface WaDisconnectedInput {
  ownerName?: string | null
  clinic: ClinicSummary
  reason?: string | null
}

export function renderWaDisconnected(
  input: WaDisconnectedInput,
): RenderedEmail {
  const name = (input.ownerName?.trim() || '').split(' ')[0] || 'doctor/a'
  const link = `${env.DASHBOARD_URL}/dashboard/whatsapp`

  const subject = `Tu WhatsApp se desconectó · ${esc(input.clinic.name)}`

  const inner = `
    ${hero({
      eyebrow: 'Acción requerida',
      titleHtml: `${esc(name)}, tu WhatsApp ${accent('se desconectó', theme.amber)}`,
      leadHtml: `Detectamos que la sesión de <strong style="color:${theme.text};font-weight:600;">${esc(input.clinic.name)}</strong> dejó de responder. Mientras esté así, los pacientes nuevos no reciben respuesta automática.`,
    })}

    ${card(
      `
      <div style="margin-bottom:10px;">${statusDot('Desconectado', theme.amber)}</div>
      ${row('Clínica', esc(input.clinic.name))}
      ${input.reason ? row('Motivo detectado', `<span style="color:${theme.textBody};">${esc(input.reason)}</span>`) : ''}
    `,
      { tint: 'amber', accent: theme.amber },
    )}

    ${p(`La forma más rápida de arreglarlo: <strong style="color:${theme.text};font-weight:600;">escanear el QR otra vez</strong> desde el panel. Toma menos de un minuto.`)}

    ${spacer(4)}
    ${button('Reconectar WhatsApp', link)}

    ${dividerOrnament()}
    ${small(`Si después de reconectar sigue fallando, respóndenos este correo. <strong style="color:${theme.textBody};">Un humano</strong> te ayuda.`)}
  `

  const html = renderLayout(inner, {
    accent: theme.amber,
    preheader:
      'Tu asistente dejó de responder en WhatsApp. Reconectar toma 1 minuto.',
  })

  const text = renderTextLayout(
    [
      `ACCIÓN REQUERIDA`,
      ``,
      `${name}, la sesión de WhatsApp de "${input.clinic.name}" se desconectó.`,
      input.reason ? `Motivo: ${input.reason}` : '',
      ``,
      `Reconectar (escaneando el QR otra vez): ${link}`,
      ``,
      `Si persiste, responde este correo.`,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  return { subject, html, text }
}

// ────────────────────────────────────────────────────────
//  Resumen diario al doctor
// ────────────────────────────────────────────────────────
export interface DailySummaryInput {
  ownerName?: string | null
  clinic: ClinicSummary
  /** Fecha del resumen (el día anterior, en ISO). */
  forDate: string
  stats: {
    newLeads: number
    messagesIn: number
    messagesOut: number
    appointmentsScheduled: number
    appointmentsToday: number
  }
  highlights?: string[]
}

export function renderDailySummary(input: DailySummaryInput): RenderedEmail {
  const name = (input.ownerName?.trim() || '').split(' ')[0] || 'doctor/a'
  const dateLabel = formatDate(input.forDate)
  const link = `${env.DASHBOARD_URL}/dashboard`
  const totalMessages = input.stats.messagesIn + input.stats.messagesOut

  const subject = `Resumen de ayer · ${dateLabel} · ${esc(input.clinic.name)}`

  const inner = `
    ${hero({
      eyebrow: `${greeting(name)}`,
      titleHtml: `Esto pasó ayer en ${accent(esc(input.clinic.name))}`,
      leadHtml: `Un vistazo rápido a los números de <strong style="color:${theme.text};font-weight:600;">${esc(dateLabel)}</strong>, para que entres al día con todo bajo control.`,
    })}

    ${statRow([
      { value: input.stats.newLeads, label: 'Pacientes nuevos' },
      { value: input.stats.appointmentsScheduled, label: 'Citas agendadas' },
      { value: totalMessages, label: 'Mensajes' },
    ])}

    ${
      input.stats.appointmentsToday > 0
        ? statBig({
            value: input.stats.appointmentsToday,
            label:
              input.stats.appointmentsToday === 1
                ? 'Cita programada hoy'
                : 'Citas programadas hoy',
            helper: 'Revisa la agenda para que nada se cruce.',
          })
        : ''
    }

    ${card(
      `
      ${row('Pacientes nuevos', `<span style="font-variant-numeric:tabular-nums;font-weight:700;">${input.stats.newLeads}</span>`)}
      ${row('Citas agendadas ayer', `<span style="font-variant-numeric:tabular-nums;font-weight:700;">${input.stats.appointmentsScheduled}</span>`)}
      ${row('Mensajes entrantes', `<span style="font-variant-numeric:tabular-nums;">${input.stats.messagesIn}</span>`)}
      ${row('Mensajes salientes', `<span style="font-variant-numeric:tabular-nums;">${input.stats.messagesOut}</span>`)}
    `,
      { tint: 'warm', accent: theme.lime400 },
    )}

    ${
      input.highlights?.length
        ? `${h2('Lo más interesante')}${bullets(input.highlights)}`
        : ''
    }

    ${spacer(4)}
    ${button('Abrir el panel', link)}

    ${dividerOrnament()}
    ${small(`Recibes este resumen cada mañana. Puedes desactivarlo desde <strong style="color:${theme.textBody};">Configuración → Notificaciones</strong>.`)}
  `

  const html = renderLayout(inner, {
    preheader: `${input.stats.newLeads} pacientes nuevos · ${input.stats.appointmentsScheduled} citas agendadas ayer.`,
  })

  const text = renderTextLayout(
    [
      `RESUMEN DIARIO · ${dateLabel.toUpperCase()}`,
      ``,
      `${greeting(name)},`,
      `Esto pasó ayer en "${input.clinic.name}":`,
      ``,
      `  Pacientes nuevos:     ${input.stats.newLeads}`,
      `  Citas agendadas:      ${input.stats.appointmentsScheduled}`,
      `  Mensajes entrantes:   ${input.stats.messagesIn}`,
      `  Mensajes salientes:   ${input.stats.messagesOut}`,
      input.stats.appointmentsToday > 0
        ? `\nCitas programadas HOY: ${input.stats.appointmentsToday}`
        : '',
      input.highlights?.length
        ? `\nLo más interesante:\n${input.highlights.map((h) => `  • ${h}`).join('\n')}`
        : '',
      ``,
      `Abrir el panel: ${link}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  return { subject, html, text }
}
