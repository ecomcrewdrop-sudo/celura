// ============================================================
//  CELURA · Brain · Motor de inteligencia conversacional
//  Procesa mensajes entrantes y genera respuestas humanas.
//  Cada clínica usa su propia API key de Claude.
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from './crypto.js'
import { sendMessage, type WAMessage } from './whatsapp.js'
import { scheduleFollowUps } from './scheduler.js'
import type {
  ClinicConfig,
  Lead,
  Conversation,
  Message,
  ConversationContext,
} from '../types/tenant.js'
import { SCORE_EVENTS } from '../types/tenant.js'

const supabaseAdmin = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { persistSession: false } }
)

// ── Construye el system prompt personalizado para cada clínica ──
function buildSystemPrompt(config: ClinicConfig, lead: Lead | null): string {
  const name = config.assistant_name
  const clinicName = 'la clínica'  // se puede agregar a config

  const treatmentList = config.treatments.join(', ')

  const toneGuide = {
    formal: 'Habla de manera formal y profesional. Usa "usted". Sé preciso y claro.',
    warm: 'Habla de manera cálida y cercana. Usa "tú". Sé amigable pero profesional.',
    direct: 'Habla directo al punto. Sin rodeos. Respuestas cortas y útiles.',
  }[config.tone]

  const patientName = lead?.name ? `, cuyo nombre es ${lead.name}` : ''
  const treatmentInterest = lead?.treatment_interest
    ? `El paciente ha mostrado interés en ${lead.treatment_interest}.`
    : ''
  const urgency = lead?.urgency_level === 'high' || lead?.urgency_level === 'emergency'
    ? 'Este paciente tiene una urgencia. Prioriza resolver su situación rápido.'
    : ''

  return `Eres ${name}, el asistente personal de ${clinicName}.

IDENTIDAD:
- Eres un asistente humano, capacitado y empático. NUNCA menciones que eres IA o un bot.
- Si alguien pregunta si eres un bot, di: "Soy el asistente de la clínica, aquí para ayudarte."
- Tienes conocimiento clínico básico en odontología pero NUNCA haces diagnósticos definitivos.

TONO Y ESTILO:
${toneGuide}
- Escribe como hablan las personas reales, no como un documento corporativo.
- Máximo 3-4 líneas por respuesta. Los pacientes leen en WhatsApp.
- Usa el nombre del paciente cuando lo sepas${patientName}.

TRATAMIENTOS QUE MANEJAMOS:
${treatmentList}

CONTEXTO DEL PACIENTE:
${treatmentInterest}
${urgency}

OBJETIVOS (en orden de prioridad):
1. Resolver la duda o emergencia del paciente
2. Generar confianza y conexión humana
3. Llevar al paciente a agendar una valoración
4. Capturar el nombre si no lo tenemos

AGENDAR CITAS:
- Cuando el paciente quiera agendar, pregunta qué día y horario le queda mejor.
- Confirma con: "Perfecto, quedaste agendado para [día] a las [hora]. Te recuerdo el día antes."
- No inventes horarios disponibles. Si no sabes la disponibilidad, di: "Permíteme verificar y te confirmo en segundos."

ANÁLISIS DE FOTOS:
- Si el paciente envía una foto de sus dientes, analiza lo que ves y responde con:
  1. Lo que podrías observar (sin diagnóstico definitivo)
  2. Por qué es importante revisarlo pronto
  3. Invitación a agendar una valoración sin costo

ESCALAMIENTO:
- Si el paciente menciona: ${config.escalate_on.join(', ')}, responde con empatía y prioridad máxima.
- En casos de dolor severo: "Entiendo que estás con mucho malestar. Te vamos a atender hoy mismo, ¿puedes venir esta tarde?"

${config.custom_prompt ? `INSTRUCCIONES ADICIONALES DEL DOCTOR:\n${config.custom_prompt}` : ''}

REGLAS ABSOLUTAS:
- NUNCA inventes precios específicos sin conocer el caso (di "depende del caso, en la valoración te decimos exactamente")
- NUNCA des diagnósticos definitivos ("puede ser", "se ve como", "vale la pena revisarlo")
- NUNCA prometas lo que no puedes cumplir
- SIEMPRE responde en el mismo idioma que el paciente`
}

// ── Detecta la intención del mensaje ──
function detectIntent(text: string): string {
  const lower = text.toLowerCase()
  if (/agendar|cita|turno|disponibilidad|cuándo|cuando/.test(lower)) return 'schedule'
  if (/precio|costo|cuánto|cuanto|valor|cobran/.test(lower)) return 'price'
  if (/dolor|duele|urgencia|emergencia|roto|fractura/.test(lower)) return 'emergency'
  if (/qué es|cómo funciona|información|info/.test(lower)) return 'info'
  if (/gracias|ok|listo|perfecto|genial/.test(lower)) return 'confirmation'
  return 'other'
}

// ── Calcula los puntos de score a agregar ──
function calcScorePoints(
  text: string,
  type: WAMessage['type'],
  context: ConversationContext,
  isFirstMessage: boolean
): number {
  let points = 0
  if (isFirstMessage) points += SCORE_EVENTS.FIRST_MESSAGE
  if (type === 'image') points += SCORE_EVENTS.SENDS_PHOTO
  const intent = detectIntent(text)
  if (intent === 'price') points += SCORE_EVENTS.ASKS_PRICE
  if (intent === 'schedule') points += SCORE_EVENTS.ASKS_TO_SCHEDULE
  if (intent === 'emergency') points += SCORE_EVENTS.MENTIONS_URGENCY
  return points
}

// ── Procesa un mensaje entrante completo ──
export async function processMessage(waMsg: WAMessage): Promise<void> {
  const { clinic_id, from_phone, from_jid, content, type, timestamp } = waMsg

  try {
    // 1. Cargar config de la clínica
    const { data: config } = await supabaseAdmin
      .from('clinic_config')
      .select('*')
      .eq('clinic_id', clinic_id)
      .single<ClinicConfig>()

    if (!config) {
      console.error(`[Brain] No hay config para clinic ${clinic_id}`)
      return
    }

    // 2. Verificar que tiene API key de Claude configurada
    if (!config.claude_key_enc) {
      console.warn(`[Brain] Clinic ${clinic_id} no tiene API key de Claude configurada`)
      // Enviar mensaje de error amigable al paciente no es ideal — escalar a humano
      return
    }

    // 3. Upsert del lead (crear si no existe, actualizar si ya existe)
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .upsert(
        {
          clinic_id,
          phone: from_phone,
          phone_wa_id: from_jid,
          last_message_at: new Date(timestamp).toISOString(),
          stage: 'contacted',
        },
        {
          onConflict: 'clinic_id,phone',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single<Lead>()

    if (!lead) {
      console.error(`[Brain] No se pudo crear/actualizar lead para ${from_phone}`)
      return
    }

    const isFirstMessage = lead.created_at === lead.updated_at

    // 4. Cargar o crear conversación
    let { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('lead_id', lead.id)
      .single<Conversation>()

    if (!conversation) {
      const { data: newConv } = await supabaseAdmin
        .from('conversations')
        .insert({
          clinic_id,
          lead_id: lead.id,
          messages: [],
          context: {},
        })
        .select()
        .single<Conversation>()
      conversation = newConv
    }

    if (!conversation) {
      console.error(`[Brain] No se pudo crear conversación`)
      return
    }

    // 5. Construir el nuevo mensaje del usuario
    const userMessage: Message = {
      role: 'user',
      content: type === 'image' ? '[El paciente envió una foto de sus dientes]' : content,
      timestamp: new Date(timestamp).toISOString(),
      type,
      analyzed: false,
    }

    const updatedMessages = [...conversation.messages, userMessage]

    // 6. Actualizar contexto con la intención detectada
    const intent = detectIntent(content)
    const updatedContext: ConversationContext = {
      ...conversation.context,
      last_intent: intent,
      photo_sent: type === 'image' ? true : conversation.context.photo_sent,
      price_asked: intent === 'price' ? true : conversation.context.price_asked,
      appointment_discussed: intent === 'schedule' ? true : conversation.context.appointment_discussed,
    }

    // 7. Calcular y acumular score
    const scorePoints = calcScorePoints(content, type, updatedContext, isFirstMessage)
    if (scorePoints > 0) {
      await supabaseAdmin.rpc('increment_lead_score', {
        p_lead_id: lead.id,
        p_clinic_id: clinic_id,
        p_points: scorePoints,
      })
    }

    // 8. Actualizar urgency si es emergencia
    if (intent === 'emergency') {
      await supabaseAdmin
        .from('leads')
        .update({ urgency_level: 'high' })
        .eq('id', lead.id)
    }

    // 9. Llamar a Claude con el historial completo
    const claudeKey = decrypt(config.claude_key_enc)
    const anthropic = new Anthropic({ apiKey: claudeKey })

    // Construir mensajes para Claude (últimos 20 para no gastar tokens)
    const recentMessages = updatedMessages.slice(-20)
    const claudeMessages: Anthropic.MessageParam[] = recentMessages.map(m => ({
      role: m.role,
      content: m.content,
    }))

    const systemPrompt = buildSystemPrompt(config, lead)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,  // WhatsApp: respuestas cortas
      system: systemPrompt,
      messages: claudeMessages,
    })

    const assistantText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.type === 'text' ? b.text : '')
      .join('')

    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens

    // 10. Guardar respuesta del asistente
    const assistantMessage: Message = {
      role: 'assistant',
      content: assistantText,
      timestamp: new Date().toISOString(),
      type: 'text',
    }

    // 11. Detectar si el nombre fue mencionado (heurística básica)
    let nameUpdate: Partial<Lead> = {}
    if (!lead.name && content.length < 30 && /^[A-ZÁÉÍÓÚÜÑa-záéíóúüñ\s]{2,25}$/.test(content.trim())) {
      // Posiblemente el paciente respondió con su nombre
      nameUpdate = { name: content.trim() }
    }

    // 12. Actualizar todo en DB
    await Promise.all([
      // Actualizar conversación
      supabaseAdmin
        .from('conversations')
        .update({
          messages: [...updatedMessages, assistantMessage],
          context: updatedContext,
          total_tokens: (conversation.total_tokens ?? 0) + tokensUsed,
        })
        .eq('id', conversation.id),

      // Actualizar lead
      supabaseAdmin
        .from('leads')
        .update({
          last_message_at: new Date().toISOString(),
          stage: intent === 'schedule' ? 'interested' : undefined,
          treatment_interest: updatedContext.appointment_discussed
            ? (lead.treatment_interest ?? config.treatments[0])
            : lead.treatment_interest,
          ...nameUpdate,
        })
        .eq('id', lead.id),
    ])

    // 13. Enviar respuesta por WhatsApp
    const sent = await sendMessage(clinic_id, from_phone, assistantText)
    if (!sent) {
      console.error(`[Brain] No se pudo enviar respuesta a ${from_phone}`)
    }

    // 14. Programar seguimientos si aplica
    await scheduleFollowUps(clinic_id, lead.id, intent, isFirstMessage)

    console.log(`[Brain] ✓ Clinic ${clinic_id} | ${from_phone} | Intent: ${intent} | Tokens: ${tokensUsed}`)

  } catch (err) {
    console.error(`[Brain] Error procesando mensaje de ${from_phone}:`, err)
  }
}
