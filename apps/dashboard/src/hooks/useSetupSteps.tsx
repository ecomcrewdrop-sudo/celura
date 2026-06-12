// ============================================================
//  CELURA · Sistema de guía de configuración
//  ------------------------------------------------------------
//  Deriva la lista de "pasos pendientes" a partir de la config
//  de la clínica. No requiere backend nuevo — todo lo que
//  necesita ya está en useClinic().
//
//  Cada paso tiene:
//   • prioridad (P0 crítico, P1 importante, P2 normal, P3 bonus)
//   • done? (computado)
//   • CTA con ruta + sección
//   • mins estimados
//
//  El componente de UI muestra %, próximo paso recomendado,
//  y lista agrupada por estado.
// ============================================================

import { useMemo } from 'react'
import { useClinic } from './useClinic'
import {
  Smartphone, MessageCircle, Stethoscope, Clock,
  UserRound, AlertTriangle, Scan, Sparkles, Key,
  type LucideIcon,
} from 'lucide-react'

export type SetupPriority = 'P0' | 'P1' | 'P2' | 'P3'

export interface SetupStep {
  id: string
  title: string
  desc: string
  why: string                // por qué importa (1 línea humana)
  icon: LucideIcon
  done: boolean
  priority: SetupPriority
  estMins: number
  optional: boolean
  action: {
    label: string
    to: string               // ruta destino
    section?: string         // hash de sección en Settings
  }
}

const DEFAULT_GREETINGS = [
  '', '¡Hola!', 'Hola', 'Bienvenido', 'Buen día',
]
const DEFAULT_FAREWELLS = [
  '', 'Hasta luego', 'Adiós', 'Gracias',
]

function isPersonalized(text: string | null | undefined, defaults: string[]): boolean {
  if (!text) return false
  const t = text.trim()
  if (t.length < 8) return false
  return !defaults.some((d) => t.toLowerCase() === d.toLowerCase())
}

export function useSetupSteps() {
  const { clinic, config, loading } = useClinic()

  const steps = useMemo<SetupStep[]>(() => {
    if (!clinic || !config) return []

    const list: SetupStep[] = [
      {
        id: 'wa_connect',
        title: 'Conecta tu WhatsApp',
        desc: 'Vincula tu línea para que el asistente reciba y responda mensajes reales.',
        why: 'Sin WhatsApp conectado, el asistente no puede atender pacientes.',
        icon: Smartphone,
        done: !!config.wa_connected,
        priority: 'P0',
        estMins: 2,
        optional: false,
        action: { label: 'Conectar línea', to: '/whatsapp' },
      },
      {
        id: 'assistant_name',
        title: 'Ponle nombre a tu asistente',
        desc: 'Un nombre cercano y propio de tu clínica humaniza la conversación.',
        why: 'Los pacientes responden mejor a un nombre con identidad.',
        icon: UserRound,
        done:
          !!config.assistant_name &&
          config.assistant_name.trim().length >= 2 &&
          config.assistant_name.trim().toLowerCase() !== 'celura',
        priority: 'P1',
        estMins: 1,
        optional: false,
        action: { label: 'Asignar nombre', to: '/settings', section: 'general' },
      },
      {
        id: 'greeting_farewell',
        title: 'Personaliza saludo y despedida',
        desc: 'Define las primeras y últimas palabras que tu paciente leerá.',
        why: 'El tono inicial decide si el paciente confía o se va al competidor.',
        icon: MessageCircle,
        done:
          isPersonalized(config.greeting, DEFAULT_GREETINGS) &&
          isPersonalized(config.farewell, DEFAULT_FAREWELLS),
        priority: 'P1',
        estMins: 2,
        optional: false,
        action: { label: 'Editar mensajes', to: '/settings', section: 'conversation' },
      },
      {
        id: 'treatments',
        title: 'Lista tus tratamientos',
        desc: 'Dile al asistente qué ofreces (al menos 3): limpieza, ortodoncia, blanqueamiento, implantes…',
        why: 'Solo así puede recomendar y agendar lo que tú haces — no inventa.',
        icon: Stethoscope,
        done: (config.treatments?.length ?? 0) >= 3,
        priority: 'P1',
        estMins: 2,
        optional: false,
        action: { label: 'Añadir tratamientos', to: '/settings', section: 'services' },
      },
      {
        id: 'schedule',
        title: 'Configura tus horarios',
        desc: 'Indica qué días y horas atiendes. El asistente solo agenda dentro de tu horario.',
        why: 'Evita citas a las 3 a.m. o un domingo si tú no abres ese día.',
        icon: Clock,
        done: hasAnyOpenDay(config.schedule),
        priority: 'P1',
        estMins: 2,
        optional: false,
        action: { label: 'Configurar agenda', to: '/settings', section: 'schedule' },
      },
      {
        id: 'escalate_on',
        title: 'Define cuándo te avisa a ti',
        desc: 'Palabras o casos que escalan al humano: "dolor fuerte", "urgencia", "presupuesto", etc.',
        why: 'Tú decides qué casos llegan a tu chat personal y cuáles maneja la IA sola.',
        icon: AlertTriangle,
        done: (config.escalate_on?.length ?? 0) >= 1,
        priority: 'P2',
        estMins: 2,
        optional: false,
        action: { label: 'Definir escalación', to: '/settings', section: 'services' },
      },
      {
        id: 'vision',
        title: 'Activa análisis visual de fotos',
        desc: 'Cuando un paciente manda foto de su boca, la IA detecta caries, sarro, manchas…',
        why: 'Le ahorras al paciente la pregunta "¿puede ser caries?" y le das una respuesta seria.',
        icon: Scan,
        done: !!config.vision_enabled && (config.vision_focus?.length ?? 0) >= 1,
        priority: 'P3',
        estMins: 2,
        optional: true,
        action: { label: 'Configurar visión', to: '/settings', section: 'vision' },
      },
      {
        id: 'custom_prompt',
        title: 'Afínalo con tu prompt personal',
        desc: 'Una instrucción libre que sobreescribe todo: tu personalidad, tus reglas, tu estilo.',
        why: 'Para quien quiere control fino sobre cómo habla la IA.',
        icon: Sparkles,
        done: !!config.custom_prompt && config.custom_prompt.trim().length >= 30,
        priority: 'P3',
        estMins: 3,
        optional: true,
        action: { label: 'Escribir prompt', to: '/settings', section: 'conversation' },
      },
      {
        id: 'ai_key',
        title: 'Conecta tu propia clave de IA',
        desc: 'Usa tu key de Claude u OpenAI para no depender de la cuota compartida.',
        why: 'Opcional. Por defecto usamos nuestra infraestructura, pero algunos prefieren su propia clave.',
        icon: Key,
        done:
          !!config.has_claude_key ||
          !!config.has_openai_key,
        priority: 'P3',
        estMins: 2,
        optional: true,
        action: { label: 'Añadir clave', to: '/settings', section: 'keys' },
      },
    ]

    return list
  }, [clinic, config])

  const required = useMemo(() => steps.filter((s) => !s.optional), [steps])
  const optional = useMemo(() => steps.filter((s) => s.optional), [steps])

  const requiredDone = required.filter((s) => s.done).length
  const requiredTotal = required.length
  const allDone = steps.filter((s) => s.done).length
  const allTotal = steps.length

  const progress = requiredTotal === 0 ? 1 : requiredDone / requiredTotal
  const progressPct = Math.round(progress * 100)

  // El "próximo paso" sugerido: el de menor prioridad que esté pendiente y no sea opcional.
  const nextStep = useMemo(() => {
    const order: SetupPriority[] = ['P0', 'P1', 'P2', 'P3']
    for (const p of order) {
      const candidate = steps.find((s) => !s.done && !s.optional && s.priority === p)
      if (candidate) return candidate
    }
    // Si lo requerido está completo, sugiere lo opcional
    return steps.find((s) => !s.done) ?? null
  }, [steps])

  const isComplete = requiredDone === requiredTotal
  const pendingRequiredCount = requiredTotal - requiredDone

  // Estimación de minutos restantes (solo lo no hecho)
  const minsLeft = useMemo(
    () => steps.filter((s) => !s.done).reduce((acc, s) => acc + s.estMins, 0),
    [steps],
  )

  return {
    loading,
    steps,
    required,
    optional,
    requiredDone,
    requiredTotal,
    allDone,
    allTotal,
    progress,           // 0..1
    progressPct,        // 0..100
    nextStep,
    isComplete,
    pendingRequiredCount,
    minsLeft,
  }
}

function hasAnyOpenDay(schedule: Record<string, string | null> | null | undefined): boolean {
  if (!schedule) return false
  return Object.values(schedule).some((v) => !!v && v.trim().length > 0)
}
