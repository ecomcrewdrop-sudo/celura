// ============================================================
//  CELURA · Abstracción de proveedor de IA
//  Permite que cada clínica elija entre Claude y ChatGPT sin que
//  el brain ni el motor de workflows tengan que conocer el SDK
//  específico. Mismas firmas, mismos formatos de salida.
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { decrypt } from './crypto.js'
import type { ClinicConfig } from '../types/tenant.js'

// Modelos por defecto (suficientemente capaces, costo razonable)
const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const OPENAI_MODEL = 'gpt-4o-2024-11-20'
const OPENAI_VISION_MODEL = 'gpt-4o-2024-11-20'
const OPENAI_TRANSCRIBE_MODEL = 'whisper-1'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface CompletionResult {
  text: string
  tokens_in: number
  tokens_out: number
}

export interface ImageInput {
  base64: string
  mime: string
}

/**
 * Cliente unificado de IA. Internamente sabe si llamar a Claude u OpenAI
 * según la config de la clínica. Tira un Error si la API key del
 * proveedor seleccionado no está disponible — el caller decide qué hacer.
 */
export class AIClient {
  readonly provider: 'claude' | 'openai'
  private anthropic: Anthropic | null = null
  private openai: OpenAI | null = null

  constructor(config: ClinicConfig) {
    this.provider = config.ai_provider ?? 'claude'

    if (this.provider === 'claude') {
      if (!config.claude_key_enc) {
        throw new Error(
          'Falta la API key de Claude. Configúrala en Configuración → Claves de API.',
        )
      }
      this.anthropic = new Anthropic({ apiKey: decrypt(config.claude_key_enc) })
    } else {
      if (!config.openai_key_enc) {
        throw new Error(
          'Falta la API key de OpenAI. Configúrala en Configuración → Claves de API.',
        )
      }
      this.openai = new OpenAI({ apiKey: decrypt(config.openai_key_enc) })
    }

    // Cargamos OpenAI SIEMPRE que haya key, aunque el proveedor primario
    // sea Claude. Whisper (transcripción de notas de voz) es OpenAI-only,
    // así que el doctor que use Claude para chat puede igual configurar una
    // OpenAI key solo para audios. Si no hay, transcribe() lanzará error.
    if (!this.openai && config.openai_key_enc) {
      try {
        this.openai = new OpenAI({ apiKey: decrypt(config.openai_key_enc) })
      } catch {
        /* clave inválida: ignoramos, transcribe() reportará el problema */
      }
    }
  }

  /**
   * Generar respuesta conversacional (texto plano).
   */
  async chat(opts: {
    system: string
    messages: ChatMessage[]
    maxTokens?: number
  }): Promise<CompletionResult> {
    const maxTokens = opts.maxTokens ?? 400

    if (this.provider === 'claude' && this.anthropic) {
      const res = await this.anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: opts.system,
        messages: opts.messages,
      })
      const text = res.content
        .filter((b) => b.type === 'text')
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
      return {
        text,
        tokens_in: res.usage.input_tokens,
        tokens_out: res.usage.output_tokens,
      }
    }

    if (this.provider === 'openai' && this.openai) {
      const res = await this.openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: opts.system },
          ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      })
      const text = res.choices[0]?.message?.content ?? ''
      return {
        text,
        tokens_in: res.usage?.prompt_tokens ?? 0,
        tokens_out: res.usage?.completion_tokens ?? 0,
      }
    }

    throw new Error(`Proveedor de IA no inicializado: ${this.provider}`)
  }

  /**
   * Analizar una imagen + texto opcional. Devuelve el texto crudo del
   * modelo (puede ser JSON estructurado o lenguaje natural, según
   * lo que pida el `system`).
   */
  async vision(opts: {
    system: string
    userText: string
    image: ImageInput
    maxTokens?: number
  }): Promise<string> {
    const maxTokens = opts.maxTokens ?? 1200
    const cleanMime = opts.image.mime.split(';')[0]?.trim() ?? 'image/jpeg'

    if (this.provider === 'claude' && this.anthropic) {
      const validMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
      const finalMime = (validMimes as readonly string[]).includes(cleanMime)
        ? (cleanMime as typeof validMimes[number])
        : 'image/jpeg'

      const res = await this.anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: opts.system,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: finalMime, data: opts.image.base64 },
              },
              { type: 'text', text: opts.userText },
            ],
          },
        ],
      })
      return res.content
        .filter((b) => b.type === 'text')
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim()
    }

    if (this.provider === 'openai' && this.openai) {
      const res = await this.openai.chat.completions.create({
        model: OPENAI_VISION_MODEL,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: opts.system },
          {
            role: 'user',
            content: [
              { type: 'text', text: opts.userText },
              {
                type: 'image_url',
                image_url: { url: `data:${cleanMime};base64,${opts.image.base64}` },
              },
            ],
          },
        ],
      })
      return res.choices[0]?.message?.content?.trim() ?? ''
    }

    throw new Error(`Proveedor de IA no inicializado: ${this.provider}`)
  }

  /**
   * ¿Hay capacidad de transcripción disponible? (necesita OpenAI inicializado).
   * Útil para que el brain decida si vale la pena descargar el audio.
   */
  get canTranscribe(): boolean {
    return this.openai !== null
  }

  /**
   * Transcribe una nota de voz a texto vía Whisper. WhatsApp envía audios
   * como audio/ogg (codec opus); Whisper acepta el formato directo.
   *
   * Devuelve el texto en el idioma original detectado (Whisper
   * autodetecta — el paciente que escribe en español dictará en español).
   *
   * Si no hay OpenAI key en la clínica, lanza Error claro para que el
   * caller decida si escalar a humano o ignorar.
   */
  async transcribe(opts: {
    audio: { base64: string; mime: string }
    /** Pista de idioma opcional (ej. 'es', 'en'). Whisper lo autodetecta igual. */
    language?: string
  }): Promise<{ text: string; durationSec: number | null }> {
    if (!this.openai) {
      throw new Error(
        'Para transcribir notas de voz necesitas configurar una API key de OpenAI ' +
        '(Whisper). Ve a Configuración → Claves de API.',
      )
    }

    // El SDK de OpenAI acepta File/Blob. Construimos uno a partir del base64.
    const cleanMime = opts.audio.mime.split(';')[0]?.trim() ?? 'audio/ogg'
    const buffer = Buffer.from(opts.audio.base64, 'base64')
    // Nombre con extensión coherente: Whisper usa la extensión para hint del codec.
    const ext = cleanMime.includes('mpeg') || cleanMime.includes('mp3')
      ? 'mp3'
      : cleanMime.includes('wav')
      ? 'wav'
      : cleanMime.includes('m4a') || cleanMime.includes('mp4')
      ? 'm4a'
      : 'ogg'

    const file = new File([new Uint8Array(buffer)], `audio.${ext}`, { type: cleanMime })

    const res = await this.openai.audio.transcriptions.create({
      model: OPENAI_TRANSCRIBE_MODEL,
      file,
      ...(opts.language ? { language: opts.language } : {}),
      response_format: 'verbose_json',
    })

    // verbose_json incluye 'duration'. El SDK lo tipa como any en algunas versiones.
    const text = (res as { text?: string }).text?.trim() ?? ''
    const duration = (res as { duration?: number }).duration ?? null
    return { text, durationSec: duration }
  }
}
