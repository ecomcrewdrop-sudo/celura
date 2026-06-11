// ============================================================
//  CELURA · API pública del módulo de emails
//  ------------------------------------------------------------
//  Resto del backend SOLO importa de aquí. Las funciones
//  expuestas son thin-wrappers que combinan plantilla + mailer
//  y dejan el resultado tipado.
// ============================================================

import { sendEmail } from './mailer.js'
import { renderWelcome, type WelcomeInput } from './templates/welcome.js'
import {
  renderTrialEnding,
  renderPaymentPending,
  type TrialEndingInput,
  type PaymentPendingInput,
} from './templates/trial-ending.js'
import {
  renderAppointmentConfirmation,
  renderAppointmentReminder24h,
  type AppointmentEmailInput,
} from './templates/appointment.js'
import {
  renderWaConnected,
  renderWaDisconnected,
  renderDailySummary,
  type WaConnectedInput,
  type WaDisconnectedInput,
  type DailySummaryInput,
} from './templates/operations.js'
import type { SendResult } from './types.js'

export type { SendResult, EmailKind, RenderedEmail } from './types.js'
export { sendEmail } from './mailer.js'

// ────────────────────────────────────────────────────────
//  Wrappers tipados por evento
// ────────────────────────────────────────────────────────

export async function sendWelcomeEmail(
  to: string,
  input: WelcomeInput,
): Promise<SendResult> {
  return sendEmail({
    to,
    toName: input.ownerName ?? null,
    kind: 'welcome',
    clinicId: input.clinic.id,
    rendered: renderWelcome(input),
    payload: { clinic_id: input.clinic.id, is_beta: input.isBeta },
    tags: [
      { name: 'kind', value: 'welcome' },
      { name: 'is_beta', value: input.isBeta ? 'true' : 'false' },
    ],
  })
}

export async function sendTrialEndingEmail(
  to: string,
  input: TrialEndingInput,
): Promise<SendResult> {
  return sendEmail({
    to,
    toName: input.ownerName ?? null,
    kind: 'trial_ending',
    clinicId: input.clinic.id,
    rendered: renderTrialEnding(input),
    payload: {
      clinic_id: input.clinic.id,
      trial_ends_at: input.trialEndsAt,
      is_beta: input.isBeta ?? false,
    },
    tags: [{ name: 'kind', value: 'trial_ending' }],
  })
}

export async function sendPaymentPendingEmail(
  to: string,
  input: PaymentPendingInput,
): Promise<SendResult> {
  return sendEmail({
    to,
    toName: input.ownerName ?? null,
    kind: 'payment_pending',
    clinicId: input.clinic.id,
    rendered: renderPaymentPending(input),
    payload: {
      clinic_id: input.clinic.id,
      amount: input.amount,
      currency: input.currency ?? 'MXN',
      due_at: input.dueAt,
      invoice_number: input.invoiceNumber ?? null,
    },
    tags: [{ name: 'kind', value: 'payment_pending' }],
  })
}

export async function sendAppointmentConfirmationEmail(
  to: string,
  input: AppointmentEmailInput,
): Promise<SendResult> {
  return sendEmail({
    to,
    toName: input.patientName ?? null,
    kind: 'appointment_confirmation',
    clinicId: input.clinic.id,
    rendered: renderAppointmentConfirmation(input),
    payload: {
      clinic_id: input.clinic.id,
      scheduled_at: input.scheduledAt,
      treatment: input.treatment ?? null,
    },
    tags: [{ name: 'kind', value: 'appt_confirm' }],
  })
}

export async function sendAppointmentReminder24hEmail(
  to: string,
  input: AppointmentEmailInput,
): Promise<SendResult> {
  return sendEmail({
    to,
    toName: input.patientName ?? null,
    kind: 'appointment_reminder_24h',
    clinicId: input.clinic.id,
    rendered: renderAppointmentReminder24h(input),
    payload: {
      clinic_id: input.clinic.id,
      scheduled_at: input.scheduledAt,
    },
    tags: [{ name: 'kind', value: 'appt_reminder_24h' }],
  })
}

export async function sendWaConnectedEmail(
  to: string,
  input: WaConnectedInput,
): Promise<SendResult> {
  return sendEmail({
    to,
    toName: input.ownerName ?? null,
    kind: 'wa_connected',
    clinicId: input.clinic.id,
    rendered: renderWaConnected(input),
    payload: { clinic_id: input.clinic.id, phone: input.phone ?? null },
    tags: [{ name: 'kind', value: 'wa_connected' }],
  })
}

export async function sendWaDisconnectedEmail(
  to: string,
  input: WaDisconnectedInput,
): Promise<SendResult> {
  return sendEmail({
    to,
    toName: input.ownerName ?? null,
    kind: 'wa_disconnected',
    clinicId: input.clinic.id,
    rendered: renderWaDisconnected(input),
    payload: { clinic_id: input.clinic.id, reason: input.reason ?? null },
    tags: [{ name: 'kind', value: 'wa_disconnected' }],
  })
}

export async function sendDailySummaryEmail(
  to: string,
  input: DailySummaryInput,
): Promise<SendResult> {
  return sendEmail({
    to,
    toName: input.ownerName ?? null,
    kind: 'daily_summary',
    clinicId: input.clinic.id,
    rendered: renderDailySummary(input),
    payload: {
      clinic_id: input.clinic.id,
      for_date: input.forDate,
      stats: input.stats,
    },
    tags: [{ name: 'kind', value: 'daily_summary' }],
  })
}
