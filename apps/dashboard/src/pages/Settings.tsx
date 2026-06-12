import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useClinic } from '@/hooks/useClinic'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Button from '@/components/Button'
import Input from '@/components/Input'
import {
  Save,
  Key,
  Shield,
  Scan,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Bot,
  User,
  MessageSquare,
  Stethoscope,
  Clock,
  Eye,
  EyeOff,
  RotateCcw,
  Copy,
  Check,
  AlertTriangle,
  Plus,
  X,
  BellRing,
  Moon,
  ChevronDown,
} from 'lucide-react'

type SectionId = 'general' | 'conversation' | 'services' | 'schedule' | 'followups' | 'vision' | 'engine' | 'keys'
type Tone = 'warm' | 'formal' | 'direct'
type Sensitivity = 'conservative' | 'balanced' | 'thorough'
type Provider = 'claude' | 'openai'

interface FollowupForm {
  appointment_reminders: {
    h24_enabled: boolean
    h2_enabled: boolean
    h2_minutes_before: number
    post_visit_enabled: boolean
    post_visit_minutes_after: number
    review_request_enabled: boolean
    review_request_hours_after: number
  }
  cold_followups: {
    d7_enabled: boolean;  d7_days: number
    d14_enabled: boolean; d14_days: number
    d30_enabled: boolean; d30_days: number
  }
  reactivation: { enabled: boolean; months_inactive: number }
  ai_generated: boolean
  quiet_hours: { enabled: boolean; from: string; to: string }
  templates: {
    pre_appt_24h: string
    pre_appt_2h: string
    post_appt_1h: string
    post_appt_review: string
    cold_7d: string
    cold_14d: string
    cold_30d: string
    reactivation: string
  }
}

interface FormState {
  assistant_name: string
  tone: Tone
  greeting: string
  farewell: string
  custom_prompt: string
  treatments: string[]
  escalate_on: string[]
  ai_provider: Provider
  claude_api_key: string
  openai_api_key: string
  elevenlabs_api_key: string
  schedule: Record<string, string | null>
  vision_enabled: boolean
  vision_sensitivity: Sensitivity
  vision_focus: string[]
  vision_auto_suggest: boolean
  vision_disclaimer: string
  followup: FollowupForm
}

const DEFAULT_FOLLOWUP: FollowupForm = {
  appointment_reminders: {
    h24_enabled: true,
    h2_enabled: true,
    h2_minutes_before: 120,
    post_visit_enabled: true,
    post_visit_minutes_after: 60,
    review_request_enabled: true,
    review_request_hours_after: 24,
  },
  cold_followups: {
    d7_enabled: true,  d7_days: 7,
    d14_enabled: true, d14_days: 14,
    d30_enabled: true, d30_days: 30,
  },
  reactivation: { enabled: false, months_inactive: 3 },
  ai_generated: true,
  quiet_hours: { enabled: true, from: '21:00', to: '08:00' },
  templates: {
    pre_appt_24h: '', pre_appt_2h: '', post_appt_1h: '', post_appt_review: '',
    cold_7d: '', cold_14d: '', cold_30d: '', reactivation: '',
  },
}

const DAYS = [
  { key: 'mon', label: 'Lunes', short: 'L' },
  { key: 'tue', label: 'Martes', short: 'M' },
  { key: 'wed', label: 'Miércoles', short: 'X' },
  { key: 'thu', label: 'Jueves', short: 'J' },
  { key: 'fri', label: 'Viernes', short: 'V' },
  { key: 'sat', label: 'Sábado', short: 'S' },
  { key: 'sun', label: 'Domingo', short: 'D' },
]

const TONES: { value: Tone; label: string; desc: string; emoji: string }[] = [
  { value: 'warm', label: 'Cálido', desc: 'Amigable y cercano', emoji: '🤗' },
  { value: 'formal', label: 'Formal', desc: 'Profesional y serio', emoji: '🤝' },
  { value: 'direct', label: 'Directo', desc: 'Breve y al grano', emoji: '⚡' },
]

const SENSITIVITIES: { value: Sensitivity; label: string; desc: string }[] = [
  { value: 'conservative', label: 'Conservador', desc: 'Solo lo evidente' },
  { value: 'balanced', label: 'Equilibrado', desc: 'Detalle prudente' },
  { value: 'thorough', label: 'Exhaustivo', desc: 'Todo lo visible' },
]

const FOCUS_AREAS: { value: string; label: string; group: string }[] = [
  { value: 'caries', label: 'Caries', group: 'Patología' },
  { value: 'sarro', label: 'Sarro', group: 'Higiene' },
  { value: 'encias', label: 'Encías', group: 'Patología' },
  { value: 'desgaste', label: 'Desgaste', group: 'Estructural' },
  { value: 'fracturas', label: 'Fracturas', group: 'Estructural' },
  { value: 'protesis', label: 'Prótesis', group: 'Restauración' },
  { value: 'ortodoncia', label: 'Ortodoncia', group: 'Alineación' },
  { value: 'manchas', label: 'Manchas', group: 'Estética' },
  { value: 'alineacion', label: 'Alineación', group: 'Alineación' },
]

const SCHEDULE_PRESETS = [
  {
    id: 'lv9-19',
    label: 'L-V 9-19',
    schedule: { mon: '09:00-19:00', tue: '09:00-19:00', wed: '09:00-19:00', thu: '09:00-19:00', fri: '09:00-19:00', sat: null, sun: null },
  },
  {
    id: 'lv9-19s9-14',
    label: 'L-V 9-19 · Sáb 9-14',
    schedule: { mon: '09:00-19:00', tue: '09:00-19:00', wed: '09:00-19:00', thu: '09:00-19:00', fri: '09:00-19:00', sat: '09:00-14:00', sun: null },
  },
  {
    id: 'ls8-20',
    label: 'L-S 8-20',
    schedule: { mon: '08:00-20:00', tue: '08:00-20:00', wed: '08:00-20:00', thu: '08:00-20:00', fri: '08:00-20:00', sat: '08:00-20:00', sun: null },
  },
  {
    id: 'clear',
    label: 'Limpiar',
    schedule: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
  },
]

const SECTIONS: { id: SectionId; label: string; icon: typeof User; desc: string }[] = [
  { id: 'general', label: 'General', icon: User, desc: 'Nombre y tono' },
  { id: 'conversation', label: 'Conversación', icon: MessageSquare, desc: 'Saludos y prompt' },
  { id: 'services', label: 'Servicios', icon: Stethoscope, desc: 'Tratamientos y escalación' },
  { id: 'schedule', label: 'Horarios', icon: Clock, desc: 'Días y horas' },
  { id: 'followups', label: 'Seguimientos', icon: BellRing, desc: 'Recordatorios y cold leads' },
  { id: 'vision', label: 'Análisis visual', icon: Scan, desc: 'IA clínica de fotos' },
  { id: 'engine', label: 'Motor de IA', icon: Bot, desc: 'Claude o ChatGPT' },
  { id: 'keys', label: 'Claves API', icon: Key, desc: 'Claude · OpenAI · ElevenLabs' },
]

const EMPTY_FORM: FormState = {
  assistant_name: '',
  tone: 'warm',
  greeting: '',
  farewell: '',
  custom_prompt: '',
  treatments: [],
  escalate_on: [],
  ai_provider: 'claude',
  claude_api_key: '',
  openai_api_key: '',
  elevenlabs_api_key: '',
  schedule: {},
  vision_enabled: true,
  vision_sensitivity: 'balanced',
  vision_focus: [],
  vision_auto_suggest: true,
  vision_disclaimer: '',
  followup: DEFAULT_FOLLOWUP,
}

// Hace merge profundo de lo que venga del backend con los defaults.
// Si la clínica nunca tocó esta config, todos los campos quedan en su default.
function mergeFollowup(incoming: Partial<FollowupForm> | undefined): FollowupForm {
  if (!incoming) return DEFAULT_FOLLOWUP
  return {
    appointment_reminders: { ...DEFAULT_FOLLOWUP.appointment_reminders, ...incoming.appointment_reminders },
    cold_followups: { ...DEFAULT_FOLLOWUP.cold_followups, ...incoming.cold_followups },
    reactivation: { ...DEFAULT_FOLLOWUP.reactivation, ...incoming.reactivation },
    ai_generated: incoming.ai_generated ?? DEFAULT_FOLLOWUP.ai_generated,
    quiet_hours: { ...DEFAULT_FOLLOWUP.quiet_hours, ...incoming.quiet_hours },
    templates: { ...DEFAULT_FOLLOWUP.templates, ...incoming.templates },
  }
}

function normalizeScheduleEntry(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/)
  if (!match) return trimmed
  const [, h1, m1, h2, m2] = match
  return `${h1.padStart(2, '0')}:${m1}-${h2.padStart(2, '0')}:${m2}`
}

function parseSchedule(s: string | null | undefined): { from: string; to: string; open: boolean } {
  if (!s) return { from: '09:00', to: '19:00', open: false }
  const m = s.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/)
  if (!m) return { from: '09:00', to: '19:00', open: true }
  return {
    from: `${m[1].padStart(2, '0')}:${m[2]}`,
    to: `${m[3].padStart(2, '0')}:${m[4]}`,
    open: true,
  }
}

// ── Chip input (treatments / escalate_on) ──────────────────────
function ChipInput({
  value,
  onChange,
  placeholder,
  color = 'lime',
}: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  color?: 'lime' | 'red'
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim().replace(/,$/, '')
    if (!t) return
    if (value.includes(t)) { setDraft(''); return }
    onChange([...value, t])
    setDraft('')
  }
  const colorCls = color === 'lime'
    ? 'bg-lime-500/15 text-lime-300 border-lime-500/30'
    : 'bg-red-500/15 text-red-300 border-red-500/30'

  return (
    <div className="rounded-lg border border-dark-500 bg-dark-700 p-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span
            key={v}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ${colorCls}`}
          >
            {v}
            <button
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="opacity-60 hover:opacity-100"
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const next = e.target.value
            if (next.endsWith(',')) {
              setDraft(next)
              setTimeout(add, 0)
            } else {
              setDraft(next)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add() }
            if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={add}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[120px] flex-1 bg-transparent px-2 py-1 text-sm text-white outline-none placeholder-zinc-500"
        />
      </div>
    </div>
  )
}

// ── Componentes auxiliares de la sección Seguimientos ──────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? 'bg-lime-500' : 'bg-dark-500'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function ReminderRow({
  title,
  desc,
  enabled,
  onToggle,
  delay,
  onDelayChange,
  delayUnit,
  delayMin,
  delayMax,
}: {
  title: string
  desc: string
  enabled: boolean
  onToggle: (v: boolean) => void
  delay?: number
  onDelayChange?: (v: number) => void
  delayUnit?: string
  delayMin?: number
  delayMax?: number
}) {
  return (
    <div className="space-y-2 rounded-lg border border-dark-500 bg-dark-700/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">{desc}</p>
        </div>
        <Toggle on={enabled} onChange={onToggle} />
      </div>
      {delay !== undefined && onDelayChange && delayUnit && (
        <div className={`flex items-center gap-2 ${enabled ? '' : 'pointer-events-none opacity-40'}`}>
          <input
            type="number"
            min={delayMin ?? 1}
            max={delayMax ?? 999}
            value={delay}
            onChange={(e) => onDelayChange(parseInt(e.target.value || '0', 10))}
            className="w-20 rounded-lg border border-dark-500 bg-dark-700 px-2 py-1 text-sm text-white outline-none focus:border-lime-500/50"
          />
          <span className="text-xs text-zinc-400">{delayUnit}</span>
        </div>
      )}
    </div>
  )
}

const TEMPLATE_LABELS: Array<{ key: keyof FollowupForm['templates']; label: string; placeholder: string }> = [
  { key: 'pre_appt_24h',     label: 'Recordatorio 24h antes',  placeholder: '{{name}}, te recuerdo tu cita mañana…' },
  { key: 'pre_appt_2h',      label: 'Recordatorio horas antes', placeholder: '{{name}}, tu cita es muy pronto…' },
  { key: 'post_appt_1h',     label: 'Post-cita',                placeholder: '{{name}}, ¿cómo te sentiste hoy?' },
  { key: 'post_appt_review', label: 'Pedir reseña',             placeholder: 'Si quieres dejarnos una reseña en Google…' },
  { key: 'cold_7d',          label: 'Lead frío 7 días',         placeholder: '{{name}}, hace una semana preguntaste…' },
  { key: 'cold_14d',         label: 'Lead frío 14 días',        placeholder: '{{name}}, queríamos saber si aún…' },
  { key: 'cold_30d',         label: 'Lead frío 30 días',        placeholder: '{{name}}, última vez por si te interesa…' },
  { key: 'reactivation',     label: 'Reactivación',             placeholder: '{{name}}, hace tiempo que no sabemos de ti…' },
]

function renderFollowupsSection(
  form: FormState,
  setForm: React.Dispatch<React.SetStateAction<FormState>>,
) {
  const fu = form.followup
  const update = (next: Partial<FollowupForm>) =>
    setForm({ ...form, followup: { ...fu, ...next } })
  const updateReminders = (next: Partial<FollowupForm['appointment_reminders']>) =>
    update({ appointment_reminders: { ...fu.appointment_reminders, ...next } })
  const updateCold = (next: Partial<FollowupForm['cold_followups']>) =>
    update({ cold_followups: { ...fu.cold_followups, ...next } })
  const updateReact = (next: Partial<FollowupForm['reactivation']>) =>
    update({ reactivation: { ...fu.reactivation, ...next } })
  const updateQuiet = (next: Partial<FollowupForm['quiet_hours']>) =>
    update({ quiet_hours: { ...fu.quiet_hours, ...next } })
  const updateTemplate = (k: keyof FollowupForm['templates'], v: string) =>
    update({ templates: { ...fu.templates, [k]: v.slice(0, 400) } })

  return (
    <div className="space-y-5">
      {/* Modo IA + Horas silenciosas */}
      <Card>
        <div className="mb-4 flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 text-lime-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">Estilo y horario</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Decide cómo se redactan los seguimientos y cuándo NO molestar al paciente.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-dark-500 bg-dark-700/40 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">Mensajes generados por IA</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Si está activo, la IA redacta cada mensaje cuidando tono y contexto. Si lo apagas, se envía
                la plantilla fija que escribiste abajo (con variables como <code className="text-lime-400">{`{{name}}`}</code>).
              </p>
            </div>
            <Toggle on={fu.ai_generated} onChange={(v) => update({ ai_generated: v })} />
          </div>

          <div className="rounded-lg border border-dark-500 bg-dark-700/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <Moon className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">Horas silenciosas</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Si un recordatorio cae en esta ventana, se mueve al primer minuto fuera. Nadie recibe
                    WhatsApp a las 3 AM.
                  </p>
                </div>
              </div>
              <Toggle on={fu.quiet_hours.enabled} onChange={(v) => updateQuiet({ enabled: v })} />
            </div>
            <div className={`mt-3 flex items-center gap-2 ${fu.quiet_hours.enabled ? '' : 'pointer-events-none opacity-40'}`}>
              <input
                type="time"
                value={fu.quiet_hours.from}
                onChange={(e) => updateQuiet({ from: e.target.value })}
                className="rounded-lg border border-dark-500 bg-dark-700 px-2 py-1 text-sm text-white outline-none focus:border-lime-500/50"
              />
              <span className="text-xs text-zinc-500">a</span>
              <input
                type="time"
                value={fu.quiet_hours.to}
                onChange={(e) => updateQuiet({ to: e.target.value })}
                className="rounded-lg border border-dark-500 bg-dark-700 px-2 py-1 text-sm text-white outline-none focus:border-lime-500/50"
              />
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">tz de la clínica</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Recordatorios de cita */}
      <Card>
        <div className="mb-4 flex items-start gap-2">
          <BellRing className="mt-0.5 h-4 w-4 text-lime-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">Recordatorios de cita</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Se programan automáticamente cuando se agenda una cita (tanto manual como por la IA).
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <ReminderRow
            title="24 horas antes"
            desc="Aviso un día antes para que confirme o reagende."
            enabled={fu.appointment_reminders.h24_enabled}
            onToggle={(v) => updateReminders({ h24_enabled: v })}
          />
          <ReminderRow
            title="Horas antes (configurable)"
            desc="Último recordatorio antes de la cita."
            enabled={fu.appointment_reminders.h2_enabled}
            onToggle={(v) => updateReminders({ h2_enabled: v })}
            delay={fu.appointment_reminders.h2_minutes_before}
            onDelayChange={(v) => updateReminders({ h2_minutes_before: v })}
            delayUnit="minutos antes"
            delayMin={15}
            delayMax={240}
          />
          <ReminderRow
            title="Post-cita"
            desc="Mensaje cálido tras la visita preguntando cómo se sintió."
            enabled={fu.appointment_reminders.post_visit_enabled}
            onToggle={(v) => updateReminders({ post_visit_enabled: v })}
            delay={fu.appointment_reminders.post_visit_minutes_after}
            onDelayChange={(v) => updateReminders({ post_visit_minutes_after: v })}
            delayUnit="minutos después"
            delayMin={15}
            delayMax={240}
          />
          <ReminderRow
            title="Pedir reseña en Google"
            desc="Se envía si todo salió bien. Útil para crecer tu reputación."
            enabled={fu.appointment_reminders.review_request_enabled}
            onToggle={(v) => updateReminders({ review_request_enabled: v })}
            delay={fu.appointment_reminders.review_request_hours_after}
            onDelayChange={(v) => updateReminders({ review_request_hours_after: v })}
            delayUnit="horas después de la visita"
            delayMin={6}
            delayMax={72}
          />
        </div>
      </Card>

      {/* Cold followups */}
      <Card>
        <div className="mb-4 flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 text-amber-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">Recuperación de leads fríos</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Cuando alguien escribe por primera vez y no avanza, la IA intenta retomar contacto sin
              presión.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <ReminderRow
            title="Primer intento"
            desc="Retoma el contacto con curiosidad, sin insistir."
            enabled={fu.cold_followups.d7_enabled}
            onToggle={(v) => updateCold({ d7_enabled: v })}
            delay={fu.cold_followups.d7_days}
            onDelayChange={(v) => updateCold({ d7_days: v })}
            delayUnit="días después del primer mensaje"
            delayMin={1}
            delayMax={21}
          />
          <ReminderRow
            title="Segundo intento"
            desc="Aporta algo de valor (consejo o info útil)."
            enabled={fu.cold_followups.d14_enabled}
            onToggle={(v) => updateCold({ d14_enabled: v })}
            delay={fu.cold_followups.d14_days}
            onDelayChange={(v) => updateCold({ d14_days: v })}
            delayUnit="días después"
            delayMin={7}
            delayMax={30}
          />
          <ReminderRow
            title="Último intento"
            desc="Cierre amable. Si tampoco responde, no insistimos más."
            enabled={fu.cold_followups.d30_enabled}
            onToggle={(v) => updateCold({ d30_enabled: v })}
            delay={fu.cold_followups.d30_days}
            onDelayChange={(v) => updateCold({ d30_days: v })}
            delayUnit="días después"
            delayMin={15}
            delayMax={90}
          />
        </div>
      </Card>

      {/* Reactivación */}
      <Card>
        <div className="mb-3 flex items-start gap-2">
          <RotateCcw className="mt-0.5 h-4 w-4 text-cyan-400" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white">Reactivación de pacientes</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Para quienes ya vinieron pero hace tiempo no aparecen — ideal para limpiezas o controles.
            </p>
          </div>
        </div>
        <ReminderRow
          title="Reactivar al cabo de N meses"
          desc="Mensaje cálido recordando que sigues ahí."
          enabled={fu.reactivation.enabled}
          onToggle={(v) => updateReact({ enabled: v })}
          delay={fu.reactivation.months_inactive}
          onDelayChange={(v) => updateReact({ months_inactive: v })}
          delayUnit="meses sin venir"
          delayMin={1}
          delayMax={12}
        />
      </Card>

      {/* Plantillas (collapsible) */}
      <Card>
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-start gap-2">
              <MessageSquare className="mt-0.5 h-4 w-4 text-lime-400" />
              <div>
                <h3 className="text-sm font-semibold text-white">Plantillas / voz del doctor</h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {fu.ai_generated
                    ? 'Sirven como guía de voz. La IA respeta el espíritu del texto.'
                    : 'Se envían tal cual. Soporta '}
                  {!fu.ai_generated && (
                    <>
                      <code className="text-lime-400">{`{{name}}`}</code>,{' '}
                      <code className="text-lime-400">{`{{clinic}}`}</code>,{' '}
                      <code className="text-lime-400">{`{{assistant}}`}</code>.
                    </>
                  )}
                </p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" />
          </summary>

          <div className="mt-4 space-y-3">
            {TEMPLATE_LABELS.map((t) => (
              <div key={t.key}>
                <label className="mb-1 block text-xs font-medium text-zinc-300">{t.label}</label>
                <textarea
                  rows={2}
                  value={fu.templates[t.key]}
                  onChange={(e) => updateTemplate(t.key, e.target.value)}
                  placeholder={t.placeholder}
                  className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50"
                />
                <p className="mt-0.5 text-right text-[10px] text-zinc-500">
                  {fu.templates[t.key].length}/400
                </p>
              </div>
            ))}
          </div>
        </details>
      </Card>
    </div>
  )
}

export default function Settings() {
  const { config, refresh } = useClinic()
  const [active, setActive] = useState<SectionId>('general')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [initial, setInitial] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [showClaudeKey, setShowClaudeKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [showElevenKey, setShowElevenKey] = useState(false)
  const [copiedClinicId, setCopiedClinicId] = useState(false)

  // Inicializar form desde config
  useEffect(() => {
    if (config) {
      const next: FormState = {
        assistant_name: config.assistant_name,
        tone: (config.tone as Tone) ?? 'warm',
        greeting: config.greeting,
        farewell: config.farewell,
        custom_prompt: config.custom_prompt,
        treatments: config.treatments ?? [],
        escalate_on: config.escalate_on ?? [],
        ai_provider: config.ai_provider ?? 'claude',
        claude_api_key: '',
        openai_api_key: '',
        elevenlabs_api_key: '',
        schedule: config.schedule ?? {},
        vision_enabled: config.vision_enabled ?? true,
        vision_sensitivity: config.vision_sensitivity ?? 'balanced',
        vision_focus: config.vision_focus ?? [],
        vision_auto_suggest: config.vision_auto_suggest ?? true,
        vision_disclaimer: config.vision_disclaimer ?? '',
        followup: mergeFollowup(
          (config as unknown as { followup_config?: Partial<FollowupForm> }).followup_config,
        ),
      }
      setForm(next)
      setInitial(next)
    }
  }, [config])

  // ── Dirty state por sección ──
  const dirtyBySection = useMemo<Record<SectionId, boolean>>(() => {
    const d = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
    return {
      general: d(form.assistant_name, initial.assistant_name) || d(form.tone, initial.tone),
      conversation:
        d(form.greeting, initial.greeting) ||
        d(form.farewell, initial.farewell) ||
        d(form.custom_prompt, initial.custom_prompt),
      services:
        d(form.treatments, initial.treatments) || d(form.escalate_on, initial.escalate_on),
      schedule: d(form.schedule, initial.schedule),
      followups: d(form.followup, initial.followup),
      vision:
        d(form.vision_enabled, initial.vision_enabled) ||
        d(form.vision_sensitivity, initial.vision_sensitivity) ||
        d(form.vision_focus, initial.vision_focus) ||
        d(form.vision_auto_suggest, initial.vision_auto_suggest) ||
        d(form.vision_disclaimer, initial.vision_disclaimer),
      engine: d(form.ai_provider, initial.ai_provider),
      keys: !!(form.claude_api_key || form.openai_api_key || form.elevenlabs_api_key),
    }
  }, [form, initial])

  const isDirty = useMemo(
    () => Object.values(dirtyBySection).some(Boolean),
    [dirtyBySection],
  )

  const handleSave = async () => {
    if (!form.assistant_name.trim()) {
      setFeedback({ type: 'error', msg: 'El nombre del asistente no puede estar vacío.' })
      setActive('general')
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const normalizedSchedule = Object.fromEntries(
        Object.entries(form.schedule).map(([k, v]) => [k, normalizeScheduleEntry(v)]),
      )

      const body: Record<string, unknown> = {
        assistant_name: form.assistant_name.trim(),
        tone: form.tone,
        treatments: form.treatments,
        escalate_on: form.escalate_on,
        schedule: normalizedSchedule,
        vision_enabled: form.vision_enabled,
        vision_sensitivity: form.vision_sensitivity,
        vision_focus: form.vision_focus,
        vision_auto_suggest: form.vision_auto_suggest,
        ai_provider: form.ai_provider,
      }
      if (form.greeting.trim()) body.greeting = form.greeting.trim()
      if (form.farewell.trim()) body.farewell = form.farewell.trim()
      if (form.custom_prompt.trim()) body.custom_prompt = form.custom_prompt.trim()
      if (form.vision_disclaimer.trim()) body.vision_disclaimer = form.vision_disclaimer.trim()
      if (form.claude_api_key) body.claude_api_key = form.claude_api_key
      if (form.openai_api_key) body.openai_api_key = form.openai_api_key
      if (form.elevenlabs_api_key) body.elevenlabs_api_key = form.elevenlabs_api_key

      // followup_config: solo mandamos si cambió (el backend hace merge profundo)
      if (JSON.stringify(form.followup) !== JSON.stringify(initial.followup)) {
        body.followup_config = form.followup
      }

      const res = await api.patch('/api/clinics/me/config', body)
      if (res.error) {
        setFeedback({ type: 'error', msg: res.error })
        return
      }
      setFeedback({ type: 'success', msg: 'Configuración guardada correctamente.' })
      setForm((f) => ({ ...f, claude_api_key: '', openai_api_key: '', elevenlabs_api_key: '' }))
      refresh()
      setTimeout(() => setFeedback(null), 4000)
    } catch (err) {
      setFeedback({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Error inesperado al guardar.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = () => {
    setForm(initial)
    setFeedback(null)
  }

  const updateSchedule = (k: string, raw: string | null) => {
    setForm({ ...form, schedule: { ...form.schedule, [k]: raw } })
  }

  const applyPreset = (preset: Record<string, string | null>) => {
    setForm({ ...form, schedule: { ...form.schedule, ...preset } })
  }

  const toneObj = TONES.find((t) => t.value === form.tone)!

  // ── Render por sección ─────────────────────────────────────
  const renderSection = () => {
    switch (active) {
      case 'general':
        return (
          <div className="space-y-5">
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <User className="h-4 w-4 text-lime-400" />
                <h3 className="text-sm font-semibold text-white">Identidad del asistente</h3>
              </div>
              <Input
                label="Nombre del asistente"
                value={form.assistant_name}
                onChange={(e) => setForm({ ...form, assistant_name: e.target.value })}
                placeholder="Sofía"
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                Así se presenta tu IA a los pacientes en WhatsApp.
              </p>

              <div className="mt-5 space-y-1.5">
                <label className="block text-sm font-medium text-zinc-300">Tono</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {TONES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm({ ...form, tone: t.value })}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                        form.tone === t.value
                          ? 'border-lime-500/50 bg-lime-500/10'
                          : 'border-dark-500 bg-dark-700 hover:border-dark-400'
                      }`}
                    >
                      <p className={`flex items-center gap-1.5 text-xs font-medium ${
                        form.tone === t.value ? 'text-lime-400' : 'text-white'
                      }`}>
                        <span>{t.emoji}</span> {t.label}
                      </p>
                      <p className="mt-0.5 text-[10px] text-zinc-500">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Vista previa */}
            <Card className="border-lime-500/20 bg-gradient-to-br from-dark-800 to-dark-800/50">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-lime-400" />
                <h3 className="text-sm font-semibold text-white">Vista previa</h3>
                <span className="ml-auto rounded-full bg-dark-700 px-2 py-0.5 text-[10px] text-zinc-400">
                  {toneObj.emoji} {toneObj.label}
                </span>
              </div>
              <div className="space-y-2 rounded-xl bg-dark-700/60 p-4">
                <div className="flex items-start gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-dark-500">
                    <User className="h-3 w-3 text-zinc-400" />
                  </div>
                  <div className="rounded-xl bg-dark-600 px-3 py-2 text-xs text-zinc-200">
                    Hola, quiero información de blanqueamiento.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lime-500/20">
                    <Bot className="h-3 w-3 text-lime-400" />
                  </div>
                  <div className="rounded-xl bg-lime-500/10 px-3 py-2 text-xs text-lime-100">
                    {form.greeting || '¡Hola!'} Soy{' '}
                    <span className="font-semibold">{form.assistant_name || 'tu asistente'}</span>.
                    {' '}¿En qué te puedo ayudar?
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Cambia nombre, tono o saludo y mira cómo queda al instante.
              </p>
            </Card>
          </div>
        )

      case 'conversation':
        return (
          <div className="space-y-5">
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-lime-400" />
                <h3 className="text-sm font-semibold text-white">Saludos</h3>
              </div>
              <div className="space-y-4">
                <Input
                  label="Saludo inicial"
                  value={form.greeting}
                  onChange={(e) => setForm({ ...form, greeting: e.target.value })}
                  placeholder="¡Hola! 👋"
                />
                <Input
                  label="Despedida"
                  value={form.farewell}
                  onChange={(e) => setForm({ ...form, farewell: e.target.value })}
                  placeholder="¡Que tengas un excelente día! 🦷"
                />
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Prompt personalizado</h3>
                <span className="text-[11px] text-zinc-500">{form.custom_prompt.length}/2000</span>
              </div>
              <textarea
                value={form.custom_prompt}
                onChange={(e) => setForm({ ...form, custom_prompt: e.target.value.slice(0, 2000) })}
                rows={6}
                className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50"
                placeholder="Instrucciones adicionales para el asistente. Ej: 'Siempre menciona que aceptamos seguro Sura. Si preguntan por brackets, recomienda ortodoncia invisible.'"
              />
              <p className="mt-2 text-[11px] text-zinc-500">
                Estas instrucciones se inyectan en cada respuesta de la IA. Mantén entre 50 y 500 caracteres.
              </p>
            </Card>
          </div>
        )

      case 'services':
        return (
          <div className="space-y-5">
            <Card>
              <div className="mb-1 flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-lime-400" />
                <h3 className="text-sm font-semibold text-white">Tratamientos que ofreces</h3>
              </div>
              <p className="mb-3 text-[11px] text-zinc-500">
                Escribe uno y presiona Enter o coma. Estos guían a la IA al recomendar.
              </p>
              <ChipInput
                value={form.treatments}
                onChange={(t) => setForm({ ...form, treatments: t })}
                placeholder="implantes, blanqueamiento, ortodoncia, limpieza…"
              />
            </Card>

            <Card>
              <div className="mb-1 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <h3 className="text-sm font-semibold text-white">Escalar a humano</h3>
              </div>
              <p className="mb-3 text-[11px] text-zinc-500">
                Si el paciente menciona una de estas palabras, la IA marca la conversación como urgente
                y te notifica.
              </p>
              <ChipInput
                value={form.escalate_on}
                onChange={(t) => setForm({ ...form, escalate_on: t })}
                placeholder="dolor intenso, sangrado, emergencia…"
                color="red"
              />
            </Card>
          </div>
        )

      case 'schedule':
        return (
          <div className="space-y-5">
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-lime-400" />
                <h3 className="text-sm font-semibold text-white">Presets rápidos</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {SCHEDULE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.schedule)}
                    className="rounded-full border border-dark-500 bg-dark-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-lime-500/40 hover:text-lime-300"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="mb-4 text-sm font-semibold text-white">Horarios por día</h3>
              <div className="space-y-2">
                {DAYS.map(({ key, label, short }) => {
                  const parsed = parseSchedule(form.schedule[key])
                  const isOpen = parsed.open
                  return (
                    <div
                      key={key}
                      className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center ${
                        isOpen ? 'border-dark-500 bg-dark-700' : 'border-dark-600 bg-dark-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 sm:w-32">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${
                          isOpen ? 'bg-lime-500/20 text-lime-300' : 'bg-dark-600 text-zinc-500'
                        }`}>
                          {short}
                        </div>
                        <span className={`text-sm ${isOpen ? 'text-white' : 'text-zinc-500'}`}>{label}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => updateSchedule(key, isOpen ? null : '09:00-19:00')}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                          isOpen ? 'bg-lime-500' : 'bg-dark-500'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                            isOpen ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>

                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <input
                          type="time"
                          disabled={!isOpen}
                          value={parsed.from}
                          onChange={(e) => updateSchedule(key, `${e.target.value}-${parsed.to}`)}
                          className="min-w-0 flex-1 rounded-lg border border-dark-500 bg-dark-700 px-2 py-1 text-sm text-white outline-none focus:border-lime-500/50 disabled:opacity-40 sm:flex-none"
                        />
                        <span className="text-xs text-zinc-500">a</span>
                        <input
                          type="time"
                          disabled={!isOpen}
                          value={parsed.to}
                          onChange={(e) => updateSchedule(key, `${parsed.from}-${e.target.value}`)}
                          className="min-w-0 flex-1 rounded-lg border border-dark-500 bg-dark-700 px-2 py-1 text-sm text-white outline-none focus:border-lime-500/50 disabled:opacity-40 sm:flex-none"
                        />
                        {!isOpen && (
                          <span className="text-[11px] uppercase tracking-wide text-zinc-500">Cerrado</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        )

      case 'followups':
        return renderFollowupsSection(form, setForm)

      case 'vision':
        return (
          <div className="space-y-5">
            <Card>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-2">
                  <Scan className="mt-0.5 h-4 w-4 text-lime-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">Análisis clínico de imágenes</h3>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      La IA actúa como odontólogo al recibir fotos: detecta hallazgos, decide severidad
                      y guía la conversación.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, vision_enabled: !form.vision_enabled })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    form.vision_enabled ? 'bg-lime-500' : 'bg-dark-500'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      form.vision_enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className={`space-y-5 transition-opacity ${
                form.vision_enabled ? 'opacity-100' : 'pointer-events-none opacity-40'
              }`}>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-zinc-300">Sensibilidad clínica</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {SENSITIVITIES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setForm({ ...form, vision_sensitivity: s.value })}
                        className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                          form.vision_sensitivity === s.value
                            ? 'border-lime-500/50 bg-lime-500/10'
                            : 'border-dark-500 bg-dark-700 hover:border-dark-400'
                        }`}
                      >
                        <p className={`text-xs font-medium ${
                          form.vision_sensitivity === s.value ? 'text-lime-400' : 'text-white'
                        }`}>
                          {s.label}
                        </p>
                        <p className="mt-0.5 text-[10px] text-zinc-500">{s.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-zinc-300">
                      Áreas clínicas a priorizar
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      {form.vision_focus.length} seleccionadas
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {FOCUS_AREAS.map((a) => {
                      const active = form.vision_focus.includes(a.value)
                      return (
                        <button
                          key={a.value}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              vision_focus: active
                                ? form.vision_focus.filter((v) => v !== a.value)
                                : [...form.vision_focus, a.value],
                            })
                          }
                          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-all ${
                            active
                              ? 'border-lime-500/50 bg-lime-500/15 text-lime-300'
                              : 'border-dark-500 bg-dark-700 text-zinc-400 hover:border-dark-400'
                          }`}
                        >
                          {active ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                          {a.label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    La IA enfocará su análisis aquí primero. Recomendado 4-7.
                  </p>
                </div>

                <div className="flex items-start justify-between gap-3 rounded-lg border border-dark-500 bg-dark-700/50 px-3 py-2.5 sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
                    <div>
                      <p className="text-sm font-medium text-white">Sugerir tratamiento e invitar a agendar</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Tras analizar, la IA propone tratamiento y empuja al paciente a reservar valoración.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, vision_auto_suggest: !form.vision_auto_suggest })}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      form.vision_auto_suggest ? 'bg-lime-500' : 'bg-dark-500'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        form.vision_auto_suggest ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="block text-sm font-medium text-zinc-300">Disclaimer clínico</label>
                    <span className="text-[11px] text-zinc-500">{form.vision_disclaimer.length}/300</span>
                  </div>
                  <textarea
                    value={form.vision_disclaimer}
                    onChange={(e) => setForm({ ...form, vision_disclaimer: e.target.value.slice(0, 300) })}
                    rows={3}
                    className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50"
                    placeholder="Esto es una observación preliminar. El diagnóstico definitivo requiere valoración presencial."
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    La IA siempre añade esta frase al cerrar su análisis. Te protege legalmente.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )

      case 'engine':
        return (
          <div className="space-y-5">
            <Card>
              <div className="mb-4 flex items-start gap-2">
                <Bot className="mt-0.5 h-4 w-4 text-lime-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Motor de IA del asistente</h3>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Elige qué cerebro responde a tus pacientes. Puedes cambiar cuando quieras.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    value: 'claude' as Provider,
                    title: 'Claude (Anthropic)',
                    model: 'Sonnet 4',
                    desc: 'Más empático, mejor para conversaciones largas.',
                    pros: ['Empatía natural', 'Análisis clínico potente', 'Mejor en español LATAM'],
                    has: config?.has_claude_key,
                  },
                  {
                    value: 'openai' as Provider,
                    title: 'ChatGPT (OpenAI)',
                    model: 'GPT-4o',
                    desc: 'Más directo, ágil y ampliamente conocido.',
                    pros: ['Respuestas ágiles', 'Estilo conciso', 'Ampliamente probado'],
                    has: config?.has_openai_key,
                  },
                ].map((p) => {
                  const selected = form.ai_provider === p.value
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm({ ...form, ai_provider: p.value })}
                      className={`rounded-xl border p-4 text-left transition-all ${
                        selected
                          ? 'border-lime-500/60 bg-lime-500/10'
                          : 'border-dark-500 bg-dark-700 hover:border-dark-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-semibold ${selected ? 'text-lime-400' : 'text-white'}`}>
                          {p.title}
                        </p>
                        {selected && (
                          <span className="rounded-full bg-lime-500/20 px-2 py-0.5 text-[10px] font-semibold text-lime-300">
                            ACTIVO
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-500">{p.model}</p>
                      <p className="mt-2 text-xs text-zinc-400">{p.desc}</p>
                      <ul className="mt-3 space-y-1">
                        {p.pros.map((pro) => (
                          <li key={pro} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                            <Check className="h-3 w-3 text-lime-400" /> {pro}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex items-center gap-1.5 border-t border-dark-600 pt-2 text-[11px]">
                        {p.has ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-lime-400" />
                            <span className="text-lime-300">Clave configurada</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-3 w-3 text-amber-400" />
                            <span className="text-amber-300">Falta API key</span>
                          </>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
              {!config?.[form.ai_provider === 'claude' ? 'has_claude_key' : 'has_openai_key'] && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-amber-200">
                      Para usar este motor necesitas configurar la clave API.
                    </p>
                    <button
                      onClick={() => setActive('keys')}
                      className="mt-1 text-[11px] text-amber-300 underline hover:text-amber-200"
                    >
                      Ir a Claves API →
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )

      case 'keys':
        return (
          <div className="space-y-5">
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-lime-400" />
                <p className="text-xs text-zinc-400">
                  Las claves se encriptan con <span className="font-mono text-lime-300">AES-256-GCM</span>{' '}
                  antes de guardarse. Nunca se devuelven en texto plano.
                </p>
              </div>
            </Card>

            {/* Claude */}
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-lime-400" />
                  <h3 className="text-sm font-semibold text-white">Claude (Anthropic)</h3>
                </div>
                {config?.has_claude_key && (
                  <span className="rounded-full bg-lime-500/15 px-2 py-0.5 text-[10px] font-medium text-lime-300">
                    ✓ Configurada
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showClaudeKey ? 'text' : 'password'}
                  value={form.claude_api_key}
                  onChange={(e) => setForm({ ...form, claude_api_key: e.target.value })}
                  placeholder={config?.has_claude_key ? `Actual: ${config.claude_api_key_masked}` : 'sk-ant-api03-…'}
                  className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2.5 pr-10 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowClaudeKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-white"
                  title={showClaudeKey ? 'Ocultar' : 'Mostrar'}
                >
                  {showClaudeKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-zinc-500">
                  {config?.has_claude_key
                    ? 'Deja vacío para mantener la actual.'
                    : 'Obtén una en console.anthropic.com'}
                </span>
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lime-400 hover:underline"
                >
                  Obtener clave →
                </a>
              </div>
            </Card>

            {/* OpenAI */}
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-lime-400" />
                  <h3 className="text-sm font-semibold text-white">OpenAI (ChatGPT)</h3>
                </div>
                {config?.has_openai_key && (
                  <span className="rounded-full bg-lime-500/15 px-2 py-0.5 text-[10px] font-medium text-lime-300">
                    ✓ Configurada
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showOpenaiKey ? 'text' : 'password'}
                  value={form.openai_api_key}
                  onChange={(e) => setForm({ ...form, openai_api_key: e.target.value })}
                  placeholder={config?.has_openai_key ? `Actual: ${config.openai_api_key_masked}` : 'sk-…'}
                  className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2.5 pr-10 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenaiKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-white"
                >
                  {showOpenaiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-zinc-500">
                  {config?.has_openai_key
                    ? 'Deja vacío para mantener la actual.'
                    : 'Obtén una en platform.openai.com'}
                </span>
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lime-400 hover:underline"
                >
                  Obtener clave →
                </a>
              </div>
            </Card>

            {/* ElevenLabs */}
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-400" />
                  <h3 className="text-sm font-semibold text-white">ElevenLabs</h3>
                  <span className="rounded-full bg-dark-600 px-2 py-0.5 text-[10px] text-zinc-400">opcional</span>
                </div>
                {config?.has_elevenlabs_key && (
                  <span className="rounded-full bg-lime-500/15 px-2 py-0.5 text-[10px] font-medium text-lime-300">
                    ✓ Configurada
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showElevenKey ? 'text' : 'password'}
                  value={form.elevenlabs_api_key}
                  onChange={(e) => setForm({ ...form, elevenlabs_api_key: e.target.value })}
                  placeholder={config?.has_elevenlabs_key ? `Actual: ${config.elevenlabs_api_key_masked}` : 'Opcional para notas de voz'}
                  className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2.5 pr-10 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowElevenKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-white"
                >
                  {showElevenKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </Card>
          </div>
        )
    }
  }

  return (
    <div className="animate-fade-in pb-20">
      <PageHeader
        title="Configuración"
        subtitle="Personaliza tu asistente IA"
        action={
          config?.id ? (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(config.clinic_id).catch(() => {})
                setCopiedClinicId(true)
                setTimeout(() => setCopiedClinicId(false), 1400)
              }}
              className="flex items-center gap-1.5 rounded-full bg-dark-700 px-3 py-1.5 text-[11px] text-zinc-300 hover:text-white"
              title="Copiar Clinic ID"
            >
              {copiedClinicId ? <Check className="h-3 w-3 text-lime-400" /> : <Copy className="h-3 w-3" />}
              <span className="font-mono">{config.clinic_id.slice(0, 8)}…</span>
            </button>
          ) : null
        }
      />

      {/* Banner feedback */}
      {feedback && (
        <div
          className={`mb-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 ${
            feedback.type === 'success'
              ? 'border-lime-500/30 bg-lime-500/[0.08]'
              : 'border-red-500/30 bg-red-500/[0.08]'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          )}
          <p className={`text-sm ${feedback.type === 'success' ? 'text-lime-200' : 'text-red-200'}`}>
            {feedback.msg}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Nav lateral (desktop) / tabbar horizontal (mobile) */}
        <nav className="lg:w-[260px] lg:shrink-0">
          {/* Mobile: horizontal scrollable tabbar */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide lg:hidden">
            {SECTIONS.map((s) => {
              const Icon = s.icon
              const isActive = active === s.id
              const dirty = dirtyBySection[s.id]
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={`touch-target flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'border-lime-500/40 bg-lime-500/10 text-white'
                      : 'border-dark-500 bg-dark-700 text-zinc-300'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-lime-400' : 'text-zinc-500'}`} />
                  <span className="whitespace-nowrap">{s.label}</span>
                  {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Cambios sin guardar" />}
                </button>
              )
            })}
          </div>
          {/* Desktop: vertical list */}
          <Card className="hidden p-2 lg:block">
            {SECTIONS.map((s) => {
              const Icon = s.icon
              const isActive = active === s.id
              const dirty = dirtyBySection[s.id]
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'bg-lime-500/10 text-white'
                      : 'text-zinc-300 hover:bg-dark-700'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-lime-400' : 'text-zinc-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-medium ${isActive ? 'text-white' : 'text-zinc-300'}`}>
                        {s.label}
                      </p>
                      {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Cambios sin guardar" />}
                    </div>
                    <p className="truncate text-[10px] text-zinc-500">{s.desc}</p>
                  </div>
                </button>
              )
            })}
          </Card>
        </nav>

        {/* Contenido */}
        <div className="min-w-0 flex-1">{renderSection()}</div>
      </div>

      {/* Sticky save bar */}
      {isDirty && (
        <div className="safe-pb fixed inset-x-0 bottom-0 z-30 border-t border-dark-600 bg-dark-800/95 px-4 py-3 backdrop-blur-sm lg:left-64">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="flex items-center gap-2 text-sm text-zinc-300">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Tienes cambios sin guardar
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                disabled={saving}
                className="touch-target flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-sm text-zinc-300 hover:text-white disabled:opacity-50 sm:flex-none"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Descartar
              </button>
              <Button onClick={handleSave} loading={saving} disabled={saving} className="flex-1 sm:flex-none">
                <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
