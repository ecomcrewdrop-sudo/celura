// ============================================================
//  CELURA · Rutas de citas (appointments)
//  GET    /appointments              → lista con filtros
//  GET    /appointments/:id          → detalle
//  POST   /appointments              → agendar (encola reminders)
//  PATCH  /appointments/:id          → actualizar status / fecha / notas
//  DELETE /appointments/:id          → cancelar (también cancela reminders)
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  scheduleAppointmentReminders,
  cancelAppointmentFollowUps,
} from '../services/scheduler.js'
import { sendAppointmentConfirmationEmail } from '../services/email/index.js'
import {
  scheduleAppointmentReminder24h,
  cancelAppointmentReminder24h,
} from '../services/email-scheduler.js'
import { notify } from '../services/notifications.js'
import { formatDateTime } from '../services/email/templates/format.js'

const STATUSES = [
  'scheduled',
  'confirmed',
  'attended',
  'no_show',
  'cancelled',
  'rescheduled',
] as const

const isoDate = z.string().datetime({ offset: true, message: 'Fecha debe ser ISO 8601 con zona horaria' })

const listSchema = z.object({
  status: z.enum(STATUSES).optional(),
  lead_id: z.string().uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.enum(['upcoming', 'recent']).default('upcoming'),
})

const createSchema = z.object({
  lead_id: z.string().uuid('lead_id inválido'),
  scheduled_at: isoDate,
  duration_min: z.number().int().min(15).max(480).default(60),
  treatment: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
})

const updateSchema = z.object({
  scheduled_at: isoDate.optional(),
  duration_min: z.number().int().min(15).max(480).optional(),
  treatment: z.string().max(120).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  notes: z.string().max(2000).nullable().optional(),
})

const idParam = z.object({ id: z.string().uuid('ID inválido') })

// Etapas del lead que NO bajamos al programar una cita
const STAGES_NOT_TO_DOWNGRADE = new Set(['attended', 'recurring'])

export default async function appointmentsRoutes(fastify: FastifyInstance) {
  // ── GET /appointments ───────────────────────────────────────
  fastify.get('/appointments', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = listSchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Filtros inválidos', issues: parsed.error.issues })
    }
    const { status, lead_id, from, to, limit, offset, order } = parsed.data

    let q = req.supabase.from('appointments').select('*', { count: 'exact' })

    if (status) q = q.eq('status', status)
    if (lead_id) q = q.eq('lead_id', lead_id)
    if (from) q = q.gte('scheduled_at', from)
    if (to) q = q.lte('scheduled_at', to)

    q = q.order('scheduled_at', { ascending: order === 'upcoming' })
    q = q.range(offset, offset + limit - 1)

    const { data, error, count } = await q
    if (error) {
      req.log.error({ err: error }, 'Error listando appointments')
      return reply.status(500).send({ error: 'Error consultando citas' })
    }

    return reply.send({
      appointments: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    })
  })

  // ── GET /appointments/:id ───────────────────────────────────
  fastify.get('/appointments/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = idParam.safeParse(req.params)
    if (!p.success) return reply.status(400).send({ error: 'ID inválido' })

    const { data, error } = await req.supabase
      .from('appointments')
      .select('*')
      .eq('id', p.data.id)
      .maybeSingle()

    if (error) return reply.status(500).send({ error: 'Error consultando cita' })
    if (!data) return reply.status(404).send({ error: 'Cita no encontrada' })
    return reply.send({ appointment: data })
  })

  // ── POST /appointments ──────────────────────────────────────
  fastify.post('/appointments', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', issues: parsed.error.issues })
    }
    const { clinic_id } = req.tenant

    const scheduledDate = new Date(parsed.data.scheduled_at)
    if (Number.isNaN(scheduledDate.getTime())) {
      return reply.status(400).send({ error: 'Fecha inválida' })
    }

    // 1. Verificar que el lead existe Y pertenece a esta clínica (RLS lo garantiza)
    const { data: lead, error: leadErr } = await req.supabase
      .from('leads')
      .select('id, stage, email, name')
      .eq('id', parsed.data.lead_id)
      .maybeSingle()

    if (leadErr) {
      req.log.error({ err: leadErr }, 'Error buscando lead')
      return reply.status(500).send({ error: 'Error verificando lead' })
    }
    if (!lead) {
      return reply.status(404).send({ error: 'Lead no encontrado en tu clínica' })
    }

    // 2. Crear la cita
    const { data: appt, error: apptErr } = await req.supabase
      .from('appointments')
      .insert({
        clinic_id,
        lead_id: parsed.data.lead_id,
        scheduled_at: parsed.data.scheduled_at,
        duration_min: parsed.data.duration_min,
        treatment: parsed.data.treatment ?? null,
        notes: parsed.data.notes ?? null,
        status: 'scheduled',
      })
      .select()
      .single()

    if (apptErr || !appt) {
      req.log.error({ err: apptErr }, 'Error creando appointment')
      return reply.status(500).send({ error: 'Error creando cita' })
    }

    // 3. Subir la etapa del lead a "scheduled" si está más atrás del pipeline
    if (!STAGES_NOT_TO_DOWNGRADE.has(lead.stage)) {
      await req.supabase
        .from('leads')
        .update({ stage: 'scheduled' })
        .eq('id', parsed.data.lead_id)
    }

    // 4. Encolar recordatorios automáticos (24h, 2h, post visita, reseña)
    try {
      await scheduleAppointmentReminders(
        clinic_id,
        parsed.data.lead_id,
        appt.id,
        scheduledDate,
      )
    } catch (err) {
      // No romper la respuesta si BullMQ falla — la cita ya está guardada
      req.log.error({ err }, 'Error programando reminders (cita creada igual)')
    }

    // 4.b Email recordatorio 24h al paciente (cola paralela `celura-emails`)
    void scheduleAppointmentReminder24h(
      clinic_id,
      appt.id,
      scheduledDate,
    ).catch((err) => req.log.warn({ err }, 'reminder email schedule falló'))

    // 4.c Notificación in-app al doctor: "Cita nueva con María García"
    void notify(clinic_id, {
      kind: 'appointment_new',
      severity: 'success',
      title: `Cita nueva: ${(lead as { name?: string }).name ?? 'paciente'}`,
      body: `${formatDateTime(parsed.data.scheduled_at)}${parsed.data.treatment ? ' · ' + parsed.data.treatment : ''}`,
      icon: 'CalendarPlus',
      action_url: `/dashboard/appointments/${appt.id}`,
      action_label: 'Ver cita',
      entity_type: 'appointment',
      entity_id: appt.id,
    }).catch(() => {})

    // 5. Confirmación por email al paciente (si tiene email registrado)
    const leadWithContact = lead as { id: string; stage: string; email: string | null; name: string | null }
    if (leadWithContact.email) {
      try {
        const { data: clinicRow } = await req.supabase
          .from('clinics')
          .select('id, name, slug, plan, status, phone, city')
          .eq('id', clinic_id)
          .maybeSingle<{
            id: string
            name: string
            slug: string | null
            plan: string | null
            status: string | null
            phone: string | null
            city: string | null
          }>()

        if (clinicRow) {
          void sendAppointmentConfirmationEmail(leadWithContact.email, {
            patientName: leadWithContact.name,
            clinic: {
              id: clinicRow.id,
              name: clinicRow.name,
              slug: clinicRow.slug,
              plan: clinicRow.plan,
              status: clinicRow.status,
              phone: clinicRow.phone,
              address: clinicRow.city ?? null,
            },
            scheduledAt: parsed.data.scheduled_at,
            treatment: parsed.data.treatment ?? null,
            durationMin: parsed.data.duration_min,
            notes: parsed.data.notes ?? null,
          }).catch((err) => {
            req.log.warn({ err }, 'Email de confirmación falló (cita creada igual)')
          })
        }
      } catch (err) {
        req.log.warn({ err }, 'No se pudo enviar el email de confirmación')
      }
    }

    return reply.status(201).send({ success: true, appointment: appt })
  })

  // ── PATCH /appointments/:id ─────────────────────────────────
  fastify.patch('/appointments/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = idParam.safeParse(req.params)
    if (!p.success) return reply.status(400).send({ error: 'ID inválido' })

    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', issues: parsed.error.issues })
    }
    if (Object.keys(parsed.data).length === 0) {
      return reply.status(400).send({ error: 'Nada que actualizar' })
    }
    const { clinic_id } = req.tenant

    // Estado actual para detectar cambios significativos
    const { data: current, error: currErr } = await req.supabase
      .from('appointments')
      .select('id, lead_id, scheduled_at, status')
      .eq('id', p.data.id)
      .maybeSingle()

    if (currErr) return reply.status(500).send({ error: 'Error consultando cita' })
    if (!current) return reply.status(404).send({ error: 'Cita no encontrada' })

    const { data: updated, error: updErr } = await req.supabase
      .from('appointments')
      .update(parsed.data)
      .eq('id', p.data.id)
      .select()
      .maybeSingle()

    if (updErr) {
      req.log.error({ err: updErr }, 'Error actualizando appointment')
      return reply.status(500).send({ error: 'Error actualizando cita' })
    }
    if (!updated) return reply.status(404).send({ error: 'Cita no encontrada' })

    // ── Efectos colaterales según el cambio ──

    // a) Fecha cambió → cancelar reminders viejos y reprogramar
    const dateChanged =
      parsed.data.scheduled_at && parsed.data.scheduled_at !== current.scheduled_at
    if (dateChanged) {
      try {
        await cancelAppointmentFollowUps(clinic_id, p.data.id)
        await scheduleAppointmentReminders(
          clinic_id,
          current.lead_id,
          p.data.id,
          new Date(parsed.data.scheduled_at!),
        )
      } catch (err) {
        req.log.error({ err }, 'Error reprogramando reminders')
      }

      // Email reminder 24h: cancelar el viejo + reset flag + agendar nuevo
      void cancelAppointmentReminder24h(p.data.id)
      await req.supabase
        .from('appointments')
        .update({ email_reminder_24h_sent: false })
        .eq('id', p.data.id)
      void scheduleAppointmentReminder24h(
        clinic_id,
        p.data.id,
        new Date(parsed.data.scheduled_at!),
      )

      // Notif al doctor
      void notify(clinic_id, {
        kind: 'appointment_rescheduled',
        severity: 'info',
        title: 'Cita reprogramada',
        body: `Nueva fecha: ${formatDateTime(parsed.data.scheduled_at!)}`,
        icon: 'CalendarSync',
        action_url: `/dashboard/appointments/${p.data.id}`,
        action_label: 'Ver cita',
        entity_type: 'appointment',
        entity_id: p.data.id,
      }).catch(() => {})
    }

    // b) Status pasó a cancelled / no_show / rescheduled → cancelar reminders
    const cancellingStatuses: typeof STATUSES[number][] = ['cancelled', 'no_show', 'rescheduled']
    if (
      parsed.data.status &&
      cancellingStatuses.includes(parsed.data.status) &&
      current.status !== parsed.data.status
    ) {
      try {
        await cancelAppointmentFollowUps(clinic_id, p.data.id)
      } catch (err) {
        req.log.error({ err }, 'Error cancelando reminders')
      }
      void cancelAppointmentReminder24h(p.data.id)

      // Notif al doctor según el motivo
      const statusKey = parsed.data.status as 'cancelled' | 'no_show' | 'rescheduled'
      const severityByStatus = {
        cancelled: 'warning' as const,
        no_show: 'warning' as const,
        rescheduled: 'info' as const,
      }
      const titleByStatus = {
        cancelled: 'Cita cancelada',
        no_show: 'Paciente no se presentó',
        rescheduled: 'Cita reprogramada',
      }
      void notify(clinic_id, {
        kind:
          statusKey === 'cancelled'
            ? 'appointment_cancelled'
            : statusKey === 'rescheduled'
              ? 'appointment_rescheduled'
              : 'appointment_cancelled',
        severity: severityByStatus[statusKey],
        title: titleByStatus[statusKey],
        body: `Cita del ${formatDateTime(current.scheduled_at)}.`,
        icon: parsed.data.status === 'no_show' ? 'UserX' : 'CalendarX',
        action_url: `/dashboard/appointments/${p.data.id}`,
        action_label: 'Ver detalle',
        entity_type: 'appointment',
        entity_id: p.data.id,
      }).catch(() => {})

      // Si el paciente no vino → marcar el lead como 'lost'
      if (parsed.data.status === 'no_show') {
        await req.supabase
          .from('leads')
          .update({ stage: 'lost' })
          .eq('id', current.lead_id)
      }
    }

    // c) Pasó a attended → subir el lead a 'attended'
    if (parsed.data.status === 'attended' && current.status !== 'attended') {
      await req.supabase
        .from('leads')
        .update({ stage: 'attended' })
        .eq('id', current.lead_id)
    }

    return reply.send({ success: true, appointment: updated })
  })

  // ── DELETE /appointments/:id ────────────────────────────────
  // Borrado lógico: status = 'cancelled'. No borramos la fila por auditoría.
  fastify.delete('/appointments/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = idParam.safeParse(req.params)
    if (!p.success) return reply.status(400).send({ error: 'ID inválido' })

    const { data, error } = await req.supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', p.data.id)
      .select()
      .maybeSingle()

    if (error) return reply.status(500).send({ error: 'Error cancelando cita' })
    if (!data) return reply.status(404).send({ error: 'Cita no encontrada' })

    try {
      await cancelAppointmentFollowUps(req.tenant.clinic_id, p.data.id)
    } catch (err) {
      req.log.error({ err }, 'Error cancelando reminders')
    }
    void cancelAppointmentReminder24h(p.data.id)

    void notify(req.tenant.clinic_id, {
      kind: 'appointment_cancelled',
      severity: 'warning',
      title: 'Cita cancelada',
      body: `Cita del ${formatDateTime(data.scheduled_at)}.`,
      icon: 'CalendarX',
      action_url: `/dashboard/appointments/${p.data.id}`,
      action_label: 'Ver detalle',
      entity_type: 'appointment',
      entity_id: p.data.id,
    }).catch(() => {})

    return reply.send({ success: true, appointment: data })
  })
}
