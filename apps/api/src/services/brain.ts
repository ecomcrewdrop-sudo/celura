// ============================================================
//  CELURA · Brain · Motor de inteligencia conversacional
//  Procesa mensajes entrantes y genera respuestas humanas.
//  Cada clínica usa su propia API key de Claude.
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from './crypto.js'
import { sendMessage, type WAMessage, type HistoryBatch } from './whatsapp.js'
import { scheduleFollowUps } from './scheduler.js'
import { runWorkflowsForMessage, type EngineResult } from './workflow-engine.js'
import type {
  ClinicConfig,
  Lead,
  Conversation,
  Message,
  ConversationContext,
  VisionAnalysis,
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

// ── Construye el system prompt para el analizador clínico de imágenes ──
function buildVisionPrompt(config: ClinicConfig, lead: Lead | null): string {
  const sensitivityGuide = {
    conservative:
      'Solo reporta hallazgos EVIDENTES y de alta confianza (>0.8). Si dudas, no lo incluyas. Mejor pecar de cauteloso.',
    balanced:
      'Reporta hallazgos con confianza media-alta (>0.6). Equilibra detalle clínico con prudencia.',
    thorough:
      'Reporta todo lo observable, incluso hallazgos sutiles (>0.4). Sé exhaustivo pero marca claramente la confianza.',
  }[config.vision_sensitivity]

  const focus = config.vision_focus.length
    ? config.vision_focus.join(', ')
    : 'caries, sarro, encías, desgaste, fracturas, prótesis, ortodoncia'

  const patientName = lead?.name ?? 'el paciente'
  const assistantName = config.assistant_name
  const tone = config.tone === 'formal' ? 'usted' : 'tú'

  const autoSuggest = config.vision_auto_suggest
    ? 'Tras describir los hallazgos, sugiere DE MANERA NATURAL el tratamiento o valoración necesaria e invita a agendar una cita.'
    : 'Limítate a describir lo observado. NO sugieras tratamientos ni invites a agendar — eso lo hará el asistente conversacional después.'

  return `Eres un odontólogo clínico profesional con 15+ años de experiencia analizando imágenes intraorales y extraorales. Tu trabajo es revisar la foto que ${patientName} envió por WhatsApp y emitir una observación clínica preliminar estructurada.

SENSIBILIDAD DEL ANÁLISIS:
${sensitivityGuide}

ÁREAS A REVISAR PRIORITARIAMENTE:
${focus}

PROTOCOLO DE ANÁLISIS:
1. Evalúa la calidad de la imagen (¿se ve bien? ¿enfoque? ¿iluminación? ¿ángulo útil?)
2. Identifica hallazgos clínicos visibles, su ubicación anatómica y severidad
3. Asigna un nivel de confianza honesto a cada hallazgo (0-1)
4. Determina el estado general de la boca: sano / requiere atención / urgente
5. Lista los tratamientos que típicamente corresponden a esos hallazgos
6. Decide si requiere consulta presencial (casi siempre: SÍ)
7. Redacta un mensaje empático para enviar al paciente por WhatsApp

REGLAS ABSOLUTAS:
- NUNCA des un diagnóstico definitivo. Solo "observaciones preliminares".
- Usa lenguaje accesible en el patient_message (no jerga médica pesada).
- Si la imagen es de muy mala calidad o no muestra dientes, indícalo en image_quality='baja' y findings=[].
- SIEMPRE incluye este disclaimer literal al final del patient_message: "${config.vision_disclaimer}"
- Habla al paciente como ${assistantName}, usando "${tone}".
- Máximo 5-6 líneas en patient_message. WhatsApp es corto.
${autoSuggest}

FORMATO DE SALIDA OBLIGATORIO (JSON estricto, sin markdown, sin texto extra):
{
  "image_quality": "baja" | "aceptable" | "buena",
  "findings": [
    {
      "area": "caries" | "sarro" | "encias" | "desgaste" | "fracturas" | "protesis" | "ortodoncia" | "otro",
      "severity": "leve" | "moderado" | "severo",
      "location": "string corto, ej: 'molar superior derecho'",
      "confidence": 0.0-1.0,
      "observation": "descripción clínica corta en español"
    }
  ],
  "overall_state": "sano" | "requiere_atencion" | "urgente",
  "recommended_treatments": ["nombre del tratamiento", ...],
  "patient_message": "mensaje completo listo para enviar al paciente por WhatsApp, en español, empático",
  "needs_consultation": true | false
}

Responde EXCLUSIVAMENTE con el JSON. Nada antes, nada después.`
}

// ── Analiza una imagen del paciente con Claude Vision ──
async function analyzeImage(
  anthropic: Anthropic,
  config: ClinicConfig,
  lead: Lead | null,
  imageBase64: string,
  mimeType: string,
  caption: string,
): Promise<VisionAnalysis | null> {
  try {
    const cleanMime = mimeType.split(';')[0]?.trim() ?? 'image/jpeg'
    const validMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
    const finalMime = (validMimes as readonly string[]).includes(cleanMime)
      ? cleanMime as typeof validMimes[number]
      : 'image/jpeg'

    const userText = caption
      ? `El paciente envió esta imagen con el mensaje: "${caption}". Analízala clínicamente.`
      : 'El paciente envió esta imagen sin texto. Analízala clínicamente.'

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: buildVisionPrompt(config, lead),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: finalMime,
                data: imageBase64,
              },
            },
            { type: 'text', text: userText },
          ],
        },
      ],
    })

    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => b.type === 'text' ? b.text : '')
      .join('')
      .trim()

    // Limpia posibles fences markdown si Claude los agregó
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    const parsed = JSON.parse(json) as Omit<VisionAnalysis, 'analyzed_at'>

    return {
      ...parsed,
      analyzed_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error('[Brain] Error en analyzeImage:', err)
    return null
  }
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

// ── Persistir un mensaje SIN invocar Claude ni workflows ──
// Usado para:
//   - 'outgoing'  → el doctor escribió desde su teléfono
//   - 'history'   → mensaje del histórico al sincronizar al escanear QR
// Solo crea/actualiza el lead y agrega el mensaje al array de la conversación.
export async function persistRawMessage(waMsg: WAMessage): Promise<void> {
  const { clinic_id, from_phone, from_jid, content, type, timestamp, direction } = waMsg

  try {
    // 1. Upsert del lead (sin tocar stage si ya existe)
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .upsert(
        {
          clinic_id,
          phone: from_phone,
          phone_wa_id: from_jid,
          last_message_at: new Date(timestamp).toISOString(),
        },
        {
          onConflict: 'clinic_id,phone',
          ignoreDuplicates: false,
        },
      )
      .select()
      .single<Lead>()

    if (!lead) return

    // 2. Upsert de la conversación (la crea si no existe)
    let { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('id, messages')
      .eq('clinic_id', clinic_id)
      .eq('lead_id', lead.id)
      .single<{ id: string; messages: Message[] }>()

    if (!conversation) {
      const { data: newConv } = await supabaseAdmin
        .from('conversations')
        .insert({
          clinic_id,
          lead_id: lead.id,
          messages: [],
          context: {},
        })
        .select('id, messages')
        .single<{ id: string; messages: Message[] }>()
      conversation = newConv
    }
    if (!conversation) return

    // 3. Evitar duplicados por message_id (Baileys re-emite a veces)
    const alreadyPresent = (conversation.messages ?? []).some(
      (m) => (m as Message & { wa_id?: string }).wa_id === waMsg.message_id,
    )
    if (alreadyPresent) return

    const role: Message['role'] = direction === 'outgoing' ? 'assistant' : 'user'
    const newMessage: Message & { wa_id?: string; source?: string } = {
      role,
      // historial entrante (paciente) = user; salientes desde el tel del doctor = assistant
      content: content || (type === 'image' ? '[Foto]' : ''),
      timestamp: new Date(timestamp).toISOString(),
      type,
      wa_id: waMsg.message_id,
      source: direction,   // 'history' | 'outgoing'
    }

    const updatedMessages = [...(conversation.messages ?? []), newMessage]
    // Ordenar por timestamp por si el histórico llega desordenado
    updatedMessages.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )

    await supabaseAdmin
      .from('conversations')
      .update({ messages: updatedMessages })
      .eq('id', conversation.id)
  } catch (err) {
    console.error(`[Brain] persistRawMessage error (${direction}) ${from_phone}:`, err)
  }
}

// ── Persistir un BATCH de histórico de un solo chat ──
// 1 upsert de lead + 1 upsert/select de conversación + 1 update con todos
// los mensajes mergeados. Sin invocar IA. Reemplaza N×3 calls por solo 3.
export async function persistHistoryBatch(batch: HistoryBatch): Promise<void> {
  const { clinic_id, jid, messages } = batch
  if (messages.length === 0) return

  const first = messages[0]!
  const last = messages[messages.length - 1]!

  try {
    // 1 upsert para el lead
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .upsert(
        {
          clinic_id,
          phone: first.from_phone,
          phone_wa_id: jid,
          last_message_at: new Date(last.timestamp).toISOString(),
        },
        { onConflict: 'clinic_id,phone' },
      )
      .select('id')
      .single<{ id: string }>()

    if (!lead) return

    // Conseguir conversación existente
    let { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('id, messages')
      .eq('clinic_id', clinic_id)
      .eq('lead_id', lead.id)
      .maybeSingle<{ id: string; messages: (Message & { wa_id?: string })[] }>()

    if (!conversation) {
      const { data: newConv } = await supabaseAdmin
        .from('conversations')
        .insert({ clinic_id, lead_id: lead.id, messages: [], context: {} })
        .select('id, messages')
        .single<{ id: string; messages: (Message & { wa_id?: string })[] }>()
      conversation = newConv
    }
    if (!conversation) return

    // Mergear: existentes + nuevos, dedupe por wa_id
    const existingIds = new Set(
      (conversation.messages ?? [])
        .map((m) => m.wa_id)
        .filter((id): id is string => !!id),
    )

    const newOnes: (Message & { wa_id?: string; source?: string })[] = messages
      .filter((m) => m.message_id && !existingIds.has(m.message_id))
      .map((m) => ({
        role: m.direction === 'outgoing' ? 'assistant' : 'user',
        content: m.content || (m.type === 'image' ? '[Foto]' : ''),
        timestamp: new Date(m.timestamp).toISOString(),
        type: m.type,
        wa_id: m.message_id,
        source: 'history',
      }))

    if (newOnes.length === 0) return

    const merged = [...(conversation.messages ?? []), ...newOnes]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-200) // tope global de mensajes por conversación

    await supabaseAdmin
      .from('conversations')
      .update({ messages: merged })
      .eq('id', conversation.id)

    console.log(
      `[Brain] Histórico persistido · clinic ${clinic_id} · ${first.from_phone} · ${newOnes.length} msgs nuevos`,
    )
  } catch (err) {
    console.error(`[Brain] persistHistoryBatch error clinic ${clinic_id} ${jid}:`, err)
  }
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

    // 5. Preparar cliente de Claude (lo usamos arriba si hay visión)
    const claudeKey = decrypt(config.claude_key_enc)
    const anthropic = new Anthropic({ apiKey: claudeKey })

    // 5b. Si es imagen y el análisis clínico está activo → ejecutar Claude Vision
    let visionAnalysis: VisionAnalysis | null = null
    if (
      type === 'image' &&
      config.vision_enabled &&
      waMsg.media_data
    ) {
      console.log(`[Brain] Analizando imagen clínica para clinic ${clinic_id}`)
      visionAnalysis = await analyzeImage(
        anthropic,
        config,
        lead,
        waMsg.media_data,
        waMsg.media_mimetype ?? 'image/jpeg',
        content,
      )
      if (visionAnalysis) {
        console.log(
          `[Brain] Visión OK · estado=${visionAnalysis.overall_state} · hallazgos=${visionAnalysis.findings.length}`
        )
      }
    }

    // 6. Construir el nuevo mensaje del usuario (con contexto enriquecido si hubo visión)
    let userContentForHistory: string
    if (type === 'image' && visionAnalysis) {
      const findingsSummary = visionAnalysis.findings
        .map(f => `${f.area}/${f.severity} en ${f.location} (conf ${(f.confidence * 100).toFixed(0)}%)`)
        .join('; ') || 'sin hallazgos relevantes'
      userContentForHistory =
        `[Foto del paciente${content ? ` con texto: "${content}"` : ''}]\n` +
        `Análisis clínico: calidad=${visionAnalysis.image_quality}, estado=${visionAnalysis.overall_state}. ` +
        `Hallazgos: ${findingsSummary}. ` +
        `Tratamientos sugeridos: ${visionAnalysis.recommended_treatments.join(', ') || 'ninguno'}.`
    } else if (type === 'image') {
      userContentForHistory = content
        ? `[El paciente envió una foto] "${content}"`
        : '[El paciente envió una foto de sus dientes]'
    } else {
      userContentForHistory = content
    }

    const userMessage: Message = {
      role: 'user',
      content: userContentForHistory,
      timestamp: new Date(timestamp).toISOString(),
      type,
      analyzed: !!visionAnalysis,
    }

    const updatedMessages = [...conversation.messages, userMessage]

    // 7. Actualizar contexto con la intención detectada
    const intent = detectIntent(content)
    const updatedContext: ConversationContext = {
      ...conversation.context,
      last_intent: intent,
      photo_sent: type === 'image' ? true : conversation.context.photo_sent,
      price_asked: intent === 'price' ? true : conversation.context.price_asked,
      appointment_discussed: intent === 'schedule' ? true : conversation.context.appointment_discussed,
      photo_analysis: visionAnalysis
        ? `${visionAnalysis.overall_state}: ${visionAnalysis.findings.map(f => f.area).join(', ') || 'sin hallazgos'}`
        : conversation.context.photo_analysis,
      vision_history: visionAnalysis
        ? [...(conversation.context.vision_history ?? []), visionAnalysis]
        : conversation.context.vision_history,
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

    // 8b. Ejecutar workflows visuales antes de Claude. Si alguno matchea y
    //     produce respuesta, la usamos en vez del motor conversacional libre.
    const engineResult: EngineResult = await runWorkflowsForMessage({
      waMsg,
      config,
      lead,
      conversation,
      isFirstMessage,
      intent,
      visionAnalysis,
      anthropic,
    })

    if (engineResult.matched) {
      console.log(
        `[Brain] Workflow ${engineResult.workflow_id} matched · bloques=${engineResult.blocks_executed} · respuesta=${!!engineResult.response_text}`
      )
    }

    // 9. Generar respuesta del asistente
    let assistantText: string
    let tokensUsed = 0

    if (engineResult.response_text) {
      // El workflow generó la respuesta — la usamos directamente
      assistantText = engineResult.response_text
    } else if (visionAnalysis && config.vision_auto_suggest) {
      // El analizador clínico ya redactó un patient_message listo para enviar.
      // Lo usamos directamente para no perder la voz del odontólogo profesional.
      assistantText = visionAnalysis.patient_message
    } else {
      // Llamar a Claude conversacional con el historial completo
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

      assistantText = response.content
        .filter(b => b.type === 'text')
        .map(b => b.type === 'text' ? b.text : '')
        .join('')

      tokensUsed = response.usage.input_tokens + response.usage.output_tokens
    }

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

      // Actualizar lead (combina nameUpdate, defaults por intent, y engine.lead_updates)
      supabaseAdmin
        .from('leads')
        .update({
          last_message_at: new Date().toISOString(),
          stage: engineResult.lead_updates.stage ?? (intent === 'schedule' ? 'interested' : undefined),
          treatment_interest: updatedContext.appointment_discussed
            ? (lead.treatment_interest ?? config.treatments[0])
            : lead.treatment_interest,
          ...nameUpdate,
          ...engineResult.lead_updates,
        })
        .eq('id', lead.id),
    ])

    // 12b. Si workflow escaló, marcar contexto de la conversación
    if (engineResult.escalated) {
      void supabaseAdmin
        .from('conversations')
        .update({
          context: { ...updatedContext, escalated: true },
        })
        .eq('id', conversation.id)
        .then(() => undefined)
      console.log(
        `[Brain] Conversación escalada por workflow · razón=${engineResult.escalation_reason}`
      )
    }

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
