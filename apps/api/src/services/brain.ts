// ============================================================
//  CELURA · Brain · Motor de inteligencia conversacional
//  Procesa mensajes entrantes y genera respuestas humanas.
//  Cada clínica usa su propia API key de Claude.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { type WAMessage } from './whatsapp.js'
import { sendHumanlike } from './humanizer.js'
import { scheduleFollowUps } from './scheduler.js'
import { runWorkflowsForMessage, type EngineResult } from './workflow-engine.js'
import { AIClient } from './ai-provider.js'
import { trackErrorSync } from './error-tracker.js'
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
- Si alguien pregunta si eres un bot, responde con naturalidad: "Soy el asistente de la clínica, aquí para ayudarte."
- Tienes conocimiento clínico básico en odontología pero NUNCA haces diagnósticos definitivos.

CÓMO PIENSAS (antes de responder):
1. Lee TODO el historial reciente y entiende dónde está el paciente en la conversación.
2. Identifica su intención REAL (no la literal): si pregunta "cuánto cuesta?" muchas veces quiere agendar; si dice "tengo miedo" busca contención antes que precios.
3. Detecta el tono emocional: dolor, ansiedad, urgencia, curiosidad, frustración — y ajústate.
4. Decide UNA acción principal por mensaje: resolver duda, dar contención, pedir info, o invitar a agendar. No mezcles tres a la vez.
5. Responde como una persona real: breve, directa, cálida.

TONO Y ESTILO:
${toneGuide}
- Escribe como hablan las personas reales en WhatsApp, no como un documento corporativo.
- Máximo 3-4 líneas por respuesta. Los pacientes leen en el celular.
- Usa el nombre del paciente cuando lo sepas${patientName}.
- Sin emojis salvo que el paciente los use primero.
- No repitas saludos en cada mensaje — solo la primera vez del día.

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

NOTAS DE VOZ:
- Cuando el paciente envía un audio, en el historial verás "[Nota de voz del paciente · Xs] <transcripción>".
- Reconócelo con naturalidad ("escuché tu audio", "ya te oí"), no como si te hubieran escrito.
- Si la transcripción está cortada o ambigua, pregunta una sola cosa concreta para confirmar — no asumas.
- Si en lugar de transcripción ves "[…no pudimos transcribir…]", pide gentilmente que repita por escrito.

FOTOS Y ANÁLISIS CLÍNICO:
- Si el paciente envía una foto, en el historial verás el análisis clínico estructurado (calidad, hallazgos, estado).
- Tradúcelo a lenguaje humano accesible: lo que se observa, por qué importa, qué propones.
- NUNCA des diagnóstico definitivo. Usa "se observa", "podría ser", "vale la pena que el doctor lo revise".
- Si la calidad es 'baja' o no se ve bien, pide otra foto explicando cómo tomarla (boca abierta, buena luz).
- Cierra invitando a una valoración presencial cuando sea pertinente.

AGENDAR CITAS:
- Cuando el paciente quiera agendar, pregunta qué día y horario le queda mejor.
- Confirma con: "Perfecto, quedaste agendado para [día] a las [hora]. Te recuerdo el día antes."
- No inventes horarios disponibles. Si no sabes la disponibilidad, di: "Permíteme verificar y te confirmo en segundos."

ESCALAMIENTO:
- Si el paciente menciona: ${config.escalate_on.join(', ')}, responde con empatía y prioridad máxima.
- En casos de dolor severo: "Entiendo que estás con mucho malestar. Te vamos a atender hoy mismo, ¿puedes venir esta tarde?"

MANEJO DE PRECIOS:
- Nunca inventes números específicos.
- Encuadra: "El valor depende del caso. En una valoración (15 min, sin costo) el doctor te dice exacto."
- Si insisten mucho, da un rango general SOLO si el doctor lo definió en sus instrucciones.

${config.custom_prompt ? `INSTRUCCIONES ADICIONALES DEL DOCTOR:\n${config.custom_prompt}\n` : ''}
REGLAS ABSOLUTAS:
- NUNCA inventes precios específicos sin conocer el caso.
- NUNCA des diagnósticos definitivos. Usa "puede ser", "se ve como", "vale la pena revisarlo".
- NUNCA prometas lo que no puedes cumplir.
- NUNCA reveles que eres una IA, un modelo de lenguaje, o un bot. Bajo ninguna circunstancia.
- SIEMPRE responde en el mismo idioma que el paciente.
- SI NO SABES ALGO con certeza, dilo y ofrece consultarlo con el doctor — no inventes.`
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

// ── Transcribe una nota de voz vía Whisper ──
//    WhatsApp manda audio/ogg (opus). Whisper lo procesa nativo y
//    autodetecta el idioma. Devolvemos texto + duración (si está).
async function transcribeAudio(
  ai: AIClient,
  audioBase64: string,
  mime: string,
): Promise<{ text: string; durationSec: number | null } | null> {
  if (!ai.canTranscribe) {
    console.warn('[Brain] Audio entrante pero la clínica no tiene OpenAI key — no se transcribe.')
    return null
  }
  try {
    // 'es' como pista: la mayoría de pacientes habla español, pero Whisper
    // igual autodetecta si dictan en inglés o portugués.
    const result = await ai.transcribe({
      audio: { base64: audioBase64, mime },
      language: 'es',
    })
    if (!result.text) return null
    return result
  } catch (err) {
    console.error('[Brain] Error transcribiendo audio:', (err as Error).message)
    trackErrorSync({
      source: 'whisper',
      code: 'TRANSCRIBE_FAILED',
      error: err,
      severity: 'error',
      context: { mime, audio_bytes: audioBase64.length },
    })
    return null
  }
}

// ── Analiza una imagen del paciente vía AIClient (Claude o GPT-4o) ──
async function analyzeImage(
  ai: AIClient,
  config: ClinicConfig,
  lead: Lead | null,
  imageBase64: string,
  mimeType: string,
  caption: string,
): Promise<VisionAnalysis | null> {
  try {
    const userText = caption
      ? `El paciente envió esta imagen con el mensaje: "${caption}". Analízala clínicamente.`
      : 'El paciente envió esta imagen sin texto. Analízala clínicamente.'

    const raw = await ai.vision({
      system: buildVisionPrompt(config, lead),
      userText,
      image: { base64: imageBase64, mime: mimeType },
      maxTokens: 1200,
    })

    // Limpia posibles fences markdown
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(json) as Omit<VisionAnalysis, 'analyzed_at'>

    return {
      ...parsed,
      analyzed_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error('[Brain] Error en analyzeImage:', err)
    trackErrorSync({
      source: ai.provider === 'claude' ? 'claude' : 'openai',
      code: 'VISION_FAILED',
      error: err,
      severity: 'error',
      context: { lead_id: lead?.id ?? null, has_caption: !!caption },
    })
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

    // 2. Inicializar el cliente de IA según el proveedor configurado.
    //    Si falta la API key, NO retornamos: igual persistimos el mensaje
    //    para que el doctor lo vea en Conversaciones y pueda responder a mano.
    let ai: AIClient | null = null
    try {
      ai = new AIClient(config)
    } catch (err) {
      console.warn(
        `[Brain] Clinic ${clinic_id} sin API key del proveedor seleccionado (${config.ai_provider}): ${(err as Error).message} — persistiendo mensaje sin auto-respuesta.`,
      )
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

    // 5a. Si es nota de voz → transcribir con Whisper. La transcripción
    //     PASA a ser el "contenido" del mensaje para detección de intención,
    //     contexto y respuesta. Sin transcripción → escalar a humano.
    let audioTranscript: { text: string; durationSec: number | null } | null = null
    if (ai && type === 'audio' && waMsg.media_data) {
      console.log(`[Brain] Transcribiendo audio entrante (clinic ${clinic_id})`)
      audioTranscript = await transcribeAudio(
        ai,
        waMsg.media_data,
        waMsg.media_mimetype ?? 'audio/ogg',
      )
      if (audioTranscript) {
        console.log(
          `[Brain] Audio transcrito · "${audioTranscript.text.slice(0, 60)}…" · ` +
          `${audioTranscript.durationSec ? `${audioTranscript.durationSec.toFixed(1)}s` : 'sin duración'}`,
        )
      } else {
        console.warn(`[Brain] No se pudo transcribir el audio de ${from_phone}`)
      }
    }

    // El `content` efectivo para downstream (intent, score, prompt) es la
    // transcripción si vino audio, o el texto original si fue mensaje de texto.
    const effectiveContent =
      type === 'audio' && audioTranscript ? audioTranscript.text : content

    // 5b. Si es imagen y el análisis clínico está activo Y hay AI → ejecutar visión
    let visionAnalysis: VisionAnalysis | null = null
    if (
      ai &&
      type === 'image' &&
      config.vision_enabled &&
      waMsg.media_data
    ) {
      console.log(`[Brain] Analizando imagen clínica (${ai.provider}) para clinic ${clinic_id}`)
      visionAnalysis = await analyzeImage(
        ai,
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

    // 6. Construir el nuevo mensaje del usuario (con contexto enriquecido si hubo visión/audio)
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
    } else if (type === 'audio' && audioTranscript) {
      // Damos al modelo la transcripción en limpio + meta (es nota de voz, no
      // texto escrito), para que adapte el tono ("escuché tu audio…").
      const dur = audioTranscript.durationSec
        ? ` · ${audioTranscript.durationSec.toFixed(0)}s`
        : ''
      userContentForHistory = `[Nota de voz del paciente${dur}] ${audioTranscript.text}`
    } else if (type === 'audio') {
      // Audio recibido pero sin poder transcribir (sin Whisper o falló).
      userContentForHistory =
        '[El paciente envió una nota de voz que no pudimos transcribir automáticamente. Escala con prudencia.]'
    } else {
      userContentForHistory = content
    }

    const userMessage: Message & { wa_id?: string } = {
      role: 'user',
      content: userContentForHistory,
      timestamp: new Date(timestamp).toISOString(),
      type,
      analyzed: !!visionAnalysis,
      wa_id: waMsg.message_id,
    }

    // Evitar duplicados si Baileys reemite el mismo wa_id
    const alreadyPresent = (conversation.messages ?? []).some(
      (m) => (m as Message & { wa_id?: string }).wa_id === waMsg.message_id,
    )
    const updatedMessages = alreadyPresent
      ? conversation.messages
      : [...conversation.messages, userMessage]

    // 7. Actualizar contexto con la intención detectada (a partir del texto
    //    efectivo: la transcripción si vino audio, o el texto si fue chat).
    const intent = detectIntent(effectiveContent)
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

    // 7. Calcular y acumular score (usa el texto efectivo)
    const scorePoints = calcScorePoints(effectiveContent, type, updatedContext, isFirstMessage)
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

    // 8a. Sin AI configurada → persistir el mensaje + escalar a humano y salir.
    //     Así el doctor ve la conversación en el panel y puede responder a mano.
    if (!ai) {
      await Promise.all([
        supabaseAdmin
          .from('conversations')
          .update({
            messages: updatedMessages,
            context: { ...updatedContext, escalated: true },
          })
          .eq('id', conversation.id),
        supabaseAdmin
          .from('leads')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', lead.id),
      ])
      console.log(
        `[Brain] · Clinic ${clinic_id} | ${from_phone} | mensaje persistido sin auto-respuesta (sin API key de ${config.ai_provider})`,
      )
      return
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
      ai,
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
      // Llamar al proveedor conversacional con el historial reciente.
      // 30 mensajes ≈ 15 intercambios — suficiente memoria sin disparar costo.
      const recentMessages = updatedMessages.slice(-30)
      const chatMessages = recentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      try {
        const completion = await ai.chat({
          system: buildSystemPrompt(config, lead),
          messages: chatMessages,
          maxTokens: 400,
        })
        assistantText = completion.text
        tokensUsed = completion.tokens_in + completion.tokens_out
      } catch (err) {
        trackErrorSync({
          source: ai.provider === 'claude' ? 'claude' : 'openai',
          code: 'CHAT_FAILED',
          error: err,
          severity: 'critical',
          clinicId: clinic_id,
          context: { lead_id: lead.id, conversation_id: conversation.id, messages_count: chatMessages.length },
        })
        throw err
      }
    }

    // 10. Guardar respuesta del asistente
    const assistantMessage: Message = {
      role: 'assistant',
      content: assistantText,
      timestamp: new Date().toISOString(),
      type: 'text',
    }

    // 11. Detectar si el nombre fue mencionado (heurística básica).
    //     Solo aplica a mensajes de texto cortos — no a audios/imágenes.
    let nameUpdate: Partial<Lead> = {}
    if (
      type === 'text' &&
      !lead.name &&
      content.length < 30 &&
      /^[A-ZÁÉÍÓÚÜÑa-záéíóúüñ\s]{2,25}$/.test(content.trim())
    ) {
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

    // 13. Enviar respuesta por WhatsApp con comportamiento humano
    //     (composing → delay proporcional → split en burbujas → retry)
    const sent = await sendHumanlike(clinic_id, from_phone, assistantText)
    if (!sent) {
      console.error(`[Brain] No se pudo enviar respuesta a ${from_phone}`)
    }

    // 14. Programar seguimientos si aplica
    await scheduleFollowUps(clinic_id, lead.id, intent, isFirstMessage)

    const channel = type === 'audio' ? '🎙️' : type === 'image' ? '📷' : '💬'
    console.log(
      `[Brain] ✓ Clinic ${clinic_id} | ${from_phone} | ${channel} ${type} | Intent: ${intent} | Tokens: ${tokensUsed}`,
    )

  } catch (err) {
    console.error(`[Brain] Error procesando mensaje de ${from_phone}:`, err)
    trackErrorSync({
      source: 'system',
      code: 'BRAIN_PROCESS_FAILED',
      error: err,
      severity: 'error',
      clinicId: clinic_id,
      context: { from_phone, type },
    })
  }
}
