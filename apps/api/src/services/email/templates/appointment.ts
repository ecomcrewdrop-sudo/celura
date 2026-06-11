// ============================================================
//  CELURA · Plantillas de citas (para el paciente)
//  ------------------------------------------------------------
//  Diseño 10/10:
//   • Eyebrow "TU CITA" o "MAÑANA"
//   • Stat display con la fecha clave en peso 800
//   • Card detalles con tinte warm + ribbon lime
//   • CTA WhatsApp directo (clic abre la conversación con la clínica)
//   • Bullets premium "para llegar tranquilo"
// ============================================================

import { renderLayout, renderTextLayout, esc } from './layout.js'
import {
  hero,
  p,
  h2,
  button,
  card,
  row,
  bullets,
  badge,
  spacer,
  small,
  dividerOrnament,
  accent,
} from './components.js'
import { theme } from './theme.js'
import { formatDateTime } from './format.js'
import type { ClinicSummary, RenderedEmail } from '../types.js'

export interface AppointmentEmailInput {
  patientName?: string | null
  clinic: ClinicSummary & {
    phone?: string | null
    address?: string | null
    city?: string | null
  }
  scheduledAt: string
  treatment?: string | null
  durationMin?: number | null
  notes?: string | null
}

/**
 * Confirmación tras crear la cita.
 */
export function renderAppointmentConfirmation(
  input: AppointmentEmailInput,
): RenderedEmail {
  const patient = (input.patientName?.trim() || '').split(' ')[0] || 'Hola'
  const when = formatDateTime(input.scheduledAt)
  const [whenDate, whenTime] = when.split(' · ')
  const clinic = input.clinic.name
  const duration = input.durationMin ? `${input.durationMin} minutos` : null
  const waNumber = input.clinic.phone?.replace(/[^0-9]/g, '') ?? null

  const subject = `Cita confirmada en ${clinic}${whenTime ? ' · ' + whenTime : ''}`

  const inner = `
    ${hero({
      eyebrow: 'Cita confirmada',
      titleHtml: `${esc(patient)}, te esperamos en ${accent(esc(clinic))}`,
      leadHtml: `Tu cita quedó <strong style="color:${theme.text};font-weight:600;">confirmada</strong>. Aquí los detalles para que no se te pase.`,
    })}

    <!-- Stat display: la fecha como protagonista -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 22px 0;">
      <tr>
        <td>
          <div style="font-family:${theme.font};font-size:11.5px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${theme.lime600};margin-bottom:6px;">Cuándo</div>
          <div style="font-family:${theme.font};font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-0.03em;color:${theme.text};">${esc(whenDate ?? when)}</div>
          ${whenTime ? `<div style="font-family:${theme.font};font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${theme.textBody};margin-top:4px;">${esc(whenTime)}</div>` : ''}
        </td>
      </tr>
    </table>

    ${card(
      `
      ${row('Clínica', esc(clinic))}
      ${input.treatment ? row('Tratamiento', esc(input.treatment)) : ''}
      ${duration ? row('Duración estimada', `<span style="font-variant-numeric:tabular-nums;">${esc(duration)}</span>`) : ''}
      ${input.clinic.address ? row('Dirección', esc(input.clinic.address)) : ''}
      ${input.clinic.phone ? row('Teléfono', `<span style="font-variant-numeric:tabular-nums;">${esc(input.clinic.phone)}</span>`) : ''}
    `,
      { tint: 'warm', accent: theme.lime400 },
    )}

    ${
      input.notes
        ? `${h2('Notas')}${p(esc(input.notes))}`
        : ''
    }

    ${h2('Para llegar tranquilo')}
    ${bullets([
      'Llega <strong>5-10 minutos antes</strong> para acomodarte sin prisa.',
      'Si tomas medicamentos, tráelos anotados o en su empaque.',
      '¿Necesitas reprogramar? Respóndenos por WhatsApp y lo movemos.',
    ])}

    ${
      waNumber
        ? `${spacer(4)}${button('Hablarnos por WhatsApp', `https://wa.me/${waNumber}`)}`
        : ''
    }

    ${dividerOrnament()}
    ${small(`Recibes este correo porque agendaste una cita en ${esc(clinic)}.`)}
  `

  const html = renderLayout(inner, {
    preheader: `Confirmada: ${when}. Dirección y datos en este correo.`,
    footerNote: `Si no eras tú o quieres cancelar, contesta este mensaje.`,
  })

  const text = renderTextLayout(
    [
      `CITA CONFIRMADA`,
      ``,
      `${patient}, te esperamos en ${clinic}.`,
      ``,
      `Cuándo:       ${when}`,
      input.treatment ? `Tratamiento:  ${input.treatment}` : '',
      duration ? `Duración:     ${duration}` : '',
      input.clinic.address ? `Dirección:    ${input.clinic.address}` : '',
      input.clinic.phone ? `Teléfono:     ${input.clinic.phone}` : '',
      input.notes ? `\nNotas: ${input.notes}` : '',
      ``,
      `Si necesitas reprogramar, respóndenos por WhatsApp.`,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  return { subject, html, text }
}

/**
 * Recordatorio 24h antes.
 */
export function renderAppointmentReminder24h(
  input: AppointmentEmailInput,
): RenderedEmail {
  const patient = (input.patientName?.trim() || '').split(' ')[0] || 'Hola'
  const when = formatDateTime(input.scheduledAt)
  const [whenDate, whenTime] = when.split(' · ')
  const clinic = input.clinic.name
  const waNumber = input.clinic.phone?.replace(/[^0-9]/g, '') ?? null

  const subject = `Mañana tu cita en ${clinic}${whenTime ? ' · ' + whenTime : ''}`

  const inner = `
    ${hero({
      eyebrow: 'Mañana te esperamos',
      titleHtml: `${esc(patient)}, ${accent('mañana')} es tu cita`,
      leadHtml: `Solo un recordatorio amable de tu cita en <strong style="color:${theme.text};font-weight:600;">${esc(clinic)}</strong>.`,
    })}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 22px 0;">
      <tr>
        <td>
          <div style="font-family:${theme.font};font-size:11.5px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${theme.lime600};margin-bottom:6px;">Cuándo</div>
          <div style="font-family:${theme.font};font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-0.03em;color:${theme.text};">${esc(whenDate ?? when)}</div>
          ${whenTime ? `<div style="font-family:${theme.font};font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${theme.textBody};margin-top:4px;">${esc(whenTime)}</div>` : ''}
        </td>
      </tr>
    </table>

    ${card(
      `
      ${input.treatment ? row('Tratamiento', esc(input.treatment)) : ''}
      ${input.clinic.address ? row('Dirección', esc(input.clinic.address)) : ''}
      ${input.clinic.phone ? row('Teléfono', `<span style="font-variant-numeric:tabular-nums;">${esc(input.clinic.phone)}</span>`) : ''}
      ${!input.treatment && !input.clinic.address && !input.clinic.phone ? row('Estado', badge('Confirmada', 'lime')) : ''}
    `,
      { tint: 'warm', accent: theme.lime400 },
    )}

    ${p('¿Cambio o duda? Respóndenos por WhatsApp y te ayudamos al instante.')}

    ${
      waNumber
        ? `${spacer(2)}${button('Escribirnos por WhatsApp', `https://wa.me/${waNumber}`)}`
        : ''
    }
  `

  const html = renderLayout(inner, {
    preheader: `Recordatorio: tu cita en ${clinic} es mañana, ${when}.`,
  })

  const text = renderTextLayout(
    [
      `RECORDATORIO`,
      ``,
      `${patient}, mañana te esperamos en ${clinic}:`,
      `  ${when}`,
      input.clinic.address ? `  ${input.clinic.address}` : '',
      ``,
      `¿Algún cambio? Respóndenos por WhatsApp.`,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  return { subject, html, text }
}
