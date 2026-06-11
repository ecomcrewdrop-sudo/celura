// ============================================================
//  CELURA · Layout premium de email transaccional
//  ------------------------------------------------------------
//  El "wrapper" que envuelve TODO email. Decisiones:
//   • Card blanca sobre background #F5F6F8 (más cálido que gris frío).
//   • Ribbon lime gradient en el TOP edge de la card (firma visual).
//   • Halo lime soft detrás del hero (Apple Mail / Gmail web lo rendean;
//     Outlook lo ignora limpiamente y queda neutro).
//   • Footer con wordmark + ribbon inferior + microcopy de soporte.
//   • Ancho 600px (el sweet spot de Litmus para Outlook/iOS).
// ============================================================

import { env } from '../../../config/env.js'
import { theme, wordmark } from './theme.js'
import type { LayoutOptions } from '../types.js'

/** Escapa texto para HTML. */
export function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Layout principal. `inner` viene como HTML; usa los helpers de
 * components.ts para mantener consistencia.
 */
export function renderLayout(inner: string, opts: LayoutOptions = {}): string {
  const accent = opts.accent ?? theme.lime400
  const showFooter = opts.showFooter ?? true
  const preheader = opts.preheader ?? ''
  const year = new Date().getFullYear()

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${esc(env.BRAND_NAME)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <style>
    * { font-family: 'Segoe UI', Arial, sans-serif !important; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  </style>
  <![endif]-->
  <style>
    /* Reset defensivo */
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }

    /* Mobile overrides — clientes que SÍ leen <style> */
    @media only screen and (max-width: 620px) {
      .celura-shell { padding: 20px 12px !important; }
      .celura-card { padding: 32px 24px !important; }
      .celura-h1 { font-size: 26px !important; line-height: 1.18 !important; }
      .celura-h2 { font-size: 17px !important; }
      .celura-eyebrow { font-size: 11px !important; }
      .celura-stat { font-size: 38px !important; }
      .celura-btn { display: block !important; width: 100% !important; padding: 16px 24px !important; }
      .celura-kpi-cell { display: block !important; width: 100% !important; margin: 0 0 10px 0 !important; }
    }

    /* Gmail web tiene un quirk con padding/line-height en <p> default */
    p { margin: 0 0 14px 0; }
    a { color: ${accent}; text-decoration: none; }
    a:hover { text-decoration: underline; opacity: 0.9; }
  </style>
</head>
<body style="margin:0;padding:0;background:${theme.bg};font-family:${theme.font};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">

  <!-- Pre-header oculto: lo único que ve el usuario en la lista del inbox -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${theme.bg};opacity:0;">
    ${esc(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.bg}" style="background:${theme.bg};">
    <tr>
      <td align="center" class="celura-shell" style="padding:40px 16px;">

        <!-- ╭───────────────────────────────────────────────╮ -->
        <!-- │  CONTAINER — 600px sweet spot                 │ -->
        <!-- ╰───────────────────────────────────────────────╯ -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- ─── HEADER STRIP: wordmark + eyebrow corporativo ─── -->
          <tr>
            <td style="padding:0 6px 22px 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    ${wordmark({ color: theme.text, size: 21, withDot: true })}
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-family:${theme.font};font-size:10.5px;font-weight:600;color:${theme.textDim};letter-spacing:0.14em;text-transform:uppercase;">
                      Tu asistente dental
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ╭───────────────────────────────────────────────╮ -->
          <!-- │  CARD: ribbon lime + halo + contenido         │ -->
          <!-- ╰───────────────────────────────────────────────╯ -->
          <tr>
            <td style="padding:0 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.card}"
                style="background:${theme.card};border:1px solid ${theme.border};border-radius:${theme.radiusXl}px;overflow:hidden;">

                <!-- Ribbon superior — la "firma" visual de Celura -->
                <tr>
                  <td style="padding:0;font-size:1px;line-height:1px;">
                    <div style="height:4px;background:${accent};background-image:${theme.gradientRibbon};line-height:4px;font-size:1px;">&nbsp;</div>
                  </td>
                </tr>

                <!-- Halo lime soft detrás del hero. Gmail/Apple lo rendean,
                     Outlook lo ignora y queda neutro — ambos quedan bien. -->
                <tr>
                  <td style="padding:0;background-color:${theme.card};background-image:${theme.gradientSoft};">
                    <!--[if mso]>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>
                    <![endif]-->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="celura-card" style="padding:48px 44px 44px 44px;font-family:${theme.font};color:${theme.text};line-height:1.55;">
                          ${inner}
                        </td>
                      </tr>
                    </table>
                    <!--[if mso]>
                    </td></tr></table>
                    <![endif]-->
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          ${
            showFooter
              ? `
          <!-- ╭───────────────────────────────────────────────╮ -->
          <!-- │  FOOTER: wordmark + microcopy + ribbon         │ -->
          <!-- ╰───────────────────────────────────────────────╯ -->
          <tr>
            <td style="padding:28px 14px 8px 14px;">

              <!-- Wordmark + tagline centrados -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:10px;">
                    ${wordmark({ color: theme.text, size: 17, withDot: true })}
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:${theme.font};font-size:11px;font-weight:600;color:${theme.textDim};letter-spacing:0.14em;text-transform:uppercase;padding-bottom:18px;">
                    Tu clínica · siempre conectada
                  </td>
                </tr>
              </table>

              <!-- Línea de soporte -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${
                  opts.footerNote
                    ? `<tr><td align="center" style="font-family:${theme.font};font-size:12.5px;line-height:1.6;color:${theme.textMuted};padding:0 8px 12px 8px;">${opts.footerNote}</td></tr>`
                    : ''
                }
                <tr>
                  <td align="center" style="font-family:${theme.font};font-size:12.5px;line-height:1.6;color:${theme.textMuted};padding:0 8px 14px 8px;">
                    ¿Necesitas ayuda? Responde a este correo o escríbenos a
                    <a href="mailto:${esc(env.SUPPORT_EMAIL)}" style="color:${theme.textBody};font-weight:600;text-decoration:underline;">${esc(env.SUPPORT_EMAIL)}</a>.
                  </td>
                </tr>
              </table>

              <!-- Ribbon inferior sutil + copyright -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:6px 0 0 0;">
                    <div style="display:inline-block;height:1px;width:40px;background:${theme.border};line-height:1px;font-size:1px;vertical-align:middle;">&nbsp;</div>
                    <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${theme.lime400};margin:0 10px;vertical-align:middle;line-height:1px;font-size:1px;">&nbsp;</span>
                    <div style="display:inline-block;height:1px;width:40px;background:${theme.border};line-height:1px;font-size:1px;vertical-align:middle;">&nbsp;</div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:${theme.font};font-size:11.5px;line-height:1.6;color:${theme.textDim};padding:14px 0 0 0;">
                    © ${year} ${esc(env.BRAND_NAME)} · Hecho con cariño para clínicas dentales.
                  </td>
                </tr>
              </table>

            </td>
          </tr>
              `
              : ''
          }

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Versión texto plano. El cuerpo `inner` ya viene en texto.
 */
export function renderTextLayout(
  inner: string,
  opts?: { footerNote?: string },
): string {
  const lines = [
    inner.trim(),
    '',
    '— —',
    `${env.BRAND_NAME} · Tu clínica, siempre conectada`,
    `Soporte: ${env.SUPPORT_EMAIL}`,
  ]
  if (opts?.footerNote) lines.splice(2, 0, '', opts.footerNote)
  return lines.join('\n')
}
