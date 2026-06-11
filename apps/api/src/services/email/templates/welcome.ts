// ============================================================
//  CELURA · Plantilla: bienvenida
//  ------------------------------------------------------------
//  Diseño 10/10:
//   • Eyebrow "BIENVENIDA" → señaliza editorialmente
//   • H1 con acento lime en el nombre de la clínica
//   • Card resumen con badge del plan
//   • Pasos numerados (no bullets) — patrón "onboarding premium"
//   • CTA gradient + textLink secundario
// ============================================================

import { env } from '../../../config/env.js'
import { renderLayout, renderTextLayout, esc } from './layout.js'
import {
  hero,
  p,
  lead,
  h2,
  button,
  textLink,
  card,
  row,
  numberedSteps,
  badge,
  spacer,
  small,
  dividerOrnament,
  accent,
} from './components.js'
import { theme } from './theme.js'
import { formatDate } from './format.js'
import type { ClinicSummary, RenderedEmail } from '../types.js'

export interface WelcomeInput {
  ownerName?: string | null
  clinic: ClinicSummary
  isBeta: boolean
  trialEndsAt: string
}

export function renderWelcome(input: WelcomeInput): RenderedEmail {
  const name = (input.ownerName?.trim() || '').split(' ')[0] || 'doctor/a'
  const clinicName = input.clinic.name
  const trialDate = formatDate(input.trialEndsAt)
  const dashboardLink = `${env.DASHBOARD_URL}/dashboard`
  const whatsappLink = `${env.DASHBOARD_URL}/dashboard/whatsapp`

  const subject = input.isBeta
    ? `Bienvenido a Celura, ${esc(name)} — tu plan PRO está activo`
    : `Bienvenido a Celura, ${esc(name)}`

  const preheader = `Tu asistente para ${clinicName} ya está lista. ${trialDate ? 'Vigencia hasta el ' + trialDate + '.' : ''}`

  const inner = `
    ${hero({
      eyebrow: 'Bienvenida',
      titleHtml: `Hola ${esc(name)}, tu asistente ${accent('ya está lista')}`,
      leadHtml: `Acabamos de activar <strong style="color:${theme.text};font-weight:600;">${esc(clinicName)}</strong> en Celura. Desde ahora, tu asistente puede atender pacientes por WhatsApp <strong style="color:${theme.text};font-weight:600;">24/7</strong> — con la calidez de tu clínica.`,
    })}

    ${card(
      `
      ${row('Tu clínica', esc(clinicName))}
      ${row(
        'Plan activo',
        input.isBeta
          ? `${badge('Plan PRO', 'lime')} <span style="margin-left:6px;">${badge('Beta', 'dark')}</span>`
          : badge('Trial · 14 días', 'lime'),
      )}
      ${row('Vigencia hasta', `<span style="font-variant-numeric:tabular-nums;">${esc(trialDate)}</span>`)}
    `,
      { tint: 'warm', accent: theme.lime400 },
    )}

    ${h2('Tus próximos 3 pasos')}
    ${p('Tres cosas chiquitas que toman menos de 5 minutos y te dejan la clínica funcionando de punta a punta.')}

    ${numberedSteps([
      {
        title: 'Conecta tu WhatsApp',
        body: 'Escaneas un QR desde el panel y queda enlazado. Sin instalar nada.',
      },
      {
        title: 'Personaliza el tono',
        body: 'Decide cómo habla tu asistente — formal, cálido o directo — en Configuración.',
      },
      {
        title: 'Mira los primeros mensajes',
        body: 'En Conversaciones ves todo lo que responde, en tiempo real.',
      },
    ])}

    ${spacer(6)}
    ${button('Abrir mi panel', dashboardLink)}
    ${textLink('o conectar WhatsApp ahora', whatsappLink)}

    ${dividerOrnament()}

    ${small(
      input.isBeta
        ? `Como participante del programa beta, tienes acceso completo al plan <strong style="color:${theme.textBody};">PRO</strong> sin costo hasta el <strong style="color:${theme.textBody};">${esc(trialDate)}</strong>. Después eliges el plan que mejor te acomode — sin cargos automáticos.`
        : `Tu prueba sin costo termina el <strong style="color:${theme.textBody};">${esc(trialDate)}</strong>. No cobramos hasta que tú elijas un plan.`,
    )}
  `

  const html = renderLayout(inner, {
    preheader,
    footerNote:
      'Te enviamos este correo porque acabas de registrar tu clínica en Celura.',
  })

  const text = renderTextLayout(
    [
      `Bienvenido a Celura, ${name}.`,
      ``,
      `Acabamos de activar "${clinicName}" en Celura. Tu asistente puede atender pacientes por WhatsApp 24/7.`,
      ``,
      `Plan: ${input.isBeta ? 'PRO (Beta)' : 'Trial · 14 días'}`,
      `Vigencia: hasta el ${trialDate}`,
      ``,
      `Tus 3 próximos pasos:`,
      `  1. Conecta tu WhatsApp (escaneas el QR desde el panel).`,
      `  2. Personaliza el tono en Configuración.`,
      `  3. Mira las conversaciones en tiempo real.`,
      ``,
      `Abrir panel:   ${dashboardLink}`,
      `Conectar WA:   ${whatsappLink}`,
    ].join('\n'),
  )

  return { subject, html, text }
}
