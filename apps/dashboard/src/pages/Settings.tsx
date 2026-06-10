import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useClinic } from '@/hooks/useClinic'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Button from '@/components/Button'
import Input from '@/components/Input'
import { Save, Key, Shield, Scan, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'

const DAYS = [
  { key: 'mon', label: 'Lunes' },
  { key: 'tue', label: 'Martes' },
  { key: 'wed', label: 'Miércoles' },
  { key: 'thu', label: 'Jueves' },
  { key: 'fri', label: 'Viernes' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
]

const TONES = [
  { value: 'warm', label: 'Cálido', desc: 'Amigable y cercano' },
  { value: 'formal', label: 'Formal', desc: 'Profesional y serio' },
  { value: 'direct', label: 'Directo', desc: 'Breve y al grano' },
]

const SENSITIVITIES = [
  { value: 'conservative', label: 'Conservador', desc: 'Solo lo evidente' },
  { value: 'balanced',     label: 'Equilibrado', desc: 'Detalle prudente' },
  { value: 'thorough',     label: 'Exhaustivo',  desc: 'Todo lo visible' },
]

const FOCUS_AREAS = [
  { value: 'caries',      label: 'Caries' },
  { value: 'sarro',       label: 'Sarro' },
  { value: 'encias',      label: 'Encías' },
  { value: 'desgaste',    label: 'Desgaste' },
  { value: 'fracturas',   label: 'Fracturas' },
  { value: 'protesis',    label: 'Prótesis' },
  { value: 'ortodoncia',  label: 'Ortodoncia' },
  { value: 'manchas',     label: 'Manchas' },
  { value: 'alineacion',  label: 'Alineación' },
]

export default function Settings() {
  const { config, refresh } = useClinic()
  const [form, setForm] = useState({
    assistant_name: '',
    tone: 'warm',
    greeting: '',
    farewell: '',
    custom_prompt: '',
    treatments: '',
    escalate_on: '',
    claude_api_key: '',
    elevenlabs_api_key: '',
    schedule: {} as Record<string, string | null>,
    vision_enabled: true,
    vision_sensitivity: 'balanced' as 'conservative' | 'balanced' | 'thorough',
    vision_focus: [] as string[],
    vision_auto_suggest: true,
    vision_disclaimer: '',
  })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    if (config) {
      setForm({
        assistant_name: config.assistant_name,
        tone: config.tone,
        greeting: config.greeting,
        farewell: config.farewell,
        custom_prompt: config.custom_prompt,
        treatments: (config.treatments ?? []).join(', '),
        escalate_on: (config.escalate_on ?? []).join(', '),
        claude_api_key: '',
        elevenlabs_api_key: '',
        schedule: config.schedule ?? {},
        vision_enabled: config.vision_enabled ?? true,
        vision_sensitivity: config.vision_sensitivity ?? 'balanced',
        vision_focus: config.vision_focus ?? [],
        vision_auto_suggest: config.vision_auto_suggest ?? true,
        vision_disclaimer: config.vision_disclaimer ?? '',
      })
    }
  }, [config])

  // Normaliza una entrada de horario al formato HH:MM-HH:MM, o null si está vacío
  const normalizeScheduleEntry = (raw: string | null | undefined): string | null => {
    if (!raw) return null
    const trimmed = raw.trim()
    if (!trimmed) return null
    // Permitir entradas tipo "8:00-18:00" → "08:00-18:00"
    const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/)
    if (!match) return trimmed   // dejamos pasar y que el server valide
    const [, h1, m1, h2, m2] = match
    return `${h1.padStart(2, '0')}:${m1}-${h2.padStart(2, '0')}:${m2}`
  }

  const handleSave = async () => {
    setSaving(true)
    setFeedback(null)

    try {
      const normalizedSchedule = Object.fromEntries(
        Object.entries(form.schedule).map(([k, v]) => [k, normalizeScheduleEntry(v)]),
      )

      // Validación mínima en cliente antes de pegarle al server
      if (!form.assistant_name.trim()) {
        setFeedback({ type: 'error', msg: 'El nombre del asistente no puede estar vacío.' })
        return
      }

      const body: Record<string, unknown> = {
        assistant_name: form.assistant_name.trim(),
        tone: form.tone,
        treatments: form.treatments.split(',').map((t) => t.trim()).filter(Boolean),
        escalate_on: form.escalate_on.split(',').map((t) => t.trim()).filter(Boolean),
        schedule: normalizedSchedule,
        vision_enabled: form.vision_enabled,
        vision_sensitivity: form.vision_sensitivity,
        vision_focus: form.vision_focus,
        vision_auto_suggest: form.vision_auto_suggest,
      }

      // Campos opcionales: solo enviamos si tienen contenido (evita 400 por strings vacíos)
      if (form.greeting.trim()) body.greeting = form.greeting.trim()
      if (form.farewell.trim()) body.farewell = form.farewell.trim()
      if (form.custom_prompt.trim()) body.custom_prompt = form.custom_prompt.trim()
      if (form.vision_disclaimer.trim()) body.vision_disclaimer = form.vision_disclaimer.trim()
      if (form.claude_api_key) body.claude_api_key = form.claude_api_key
      if (form.elevenlabs_api_key) body.elevenlabs_api_key = form.elevenlabs_api_key

      const res = await api.patch('/api/clinics/me/config', body)

      if (res.error) {
        setFeedback({ type: 'error', msg: res.error })
        return
      }

      setFeedback({ type: 'success', msg: 'Configuración guardada correctamente.' })
      setForm((f) => ({ ...f, claude_api_key: '', elevenlabs_api_key: '' }))
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

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Configuración"
        subtitle="Personaliza tu asistente IA"
        action={
          <Button onClick={handleSave} loading={saving} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        }
      />

      {/* Banner de feedback (fijo arriba del contenido) */}
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

      <div className="space-y-6">
        {/* Personalidad */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-white">Personalidad del asistente</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nombre del asistente"
              value={form.assistant_name}
              onChange={(e) => setForm({ ...form, assistant_name: e.target.value })}
              placeholder="Sofía"
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Tono</label>
              <div className="grid grid-cols-3 gap-2">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setForm({ ...form, tone: t.value })}
                    className={`rounded-lg border px-3 py-2 text-left transition-all ${
                      form.tone === t.value
                        ? 'border-lime-500/50 bg-lime-500/10'
                        : 'border-dark-500 bg-dark-700 hover:border-dark-400'
                    }`}
                  >
                    <p className={`text-xs font-medium ${form.tone === t.value ? 'text-lime-400' : 'text-white'}`}>
                      {t.label}
                    </p>
                    <p className="text-[10px] text-zinc-500">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Saludo inicial"
              value={form.greeting}
              onChange={(e) => setForm({ ...form, greeting: e.target.value })}
            />
            <Input
              label="Despedida"
              value={form.farewell}
              onChange={(e) => setForm({ ...form, farewell: e.target.value })}
            />
          </div>
          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Prompt personalizado</label>
            <textarea
              value={form.custom_prompt}
              onChange={(e) => setForm({ ...form, custom_prompt: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50"
              placeholder="Instrucciones adicionales para el asistente..."
            />
          </div>
        </Card>

        {/* Tratamientos */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-white">Servicios</h3>
          <Input
            label="Tratamientos (separados por coma)"
            value={form.treatments}
            onChange={(e) => setForm({ ...form, treatments: e.target.value })}
            placeholder="implantes, blanqueamiento, ortodoncia, limpieza"
          />
          <div className="mt-4">
            <Input
              label="Escalar a humano cuando mencionen (separados por coma)"
              value={form.escalate_on}
              onChange={(e) => setForm({ ...form, escalate_on: e.target.value })}
              placeholder="dolor intenso, urgencia, emergencia"
            />
          </div>
        </Card>

        {/* Horarios */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-white">Horarios de atención</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DAYS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <label className="w-24 text-sm text-zinc-400">{label}</label>
                <input
                  type="text"
                  value={form.schedule[key] ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      schedule: { ...form.schedule, [key]: e.target.value || null },
                    })
                  }
                  placeholder="08:00-18:00"
                  className="flex-1 rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-lime-500/50"
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Análisis clínico de imágenes */}
        <Card>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-2">
              <Scan className="mt-0.5 h-4 w-4 text-lime-400" />
              <div>
                <h3 className="text-sm font-semibold text-white">Análisis clínico de imágenes</h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  La IA actúa como odontólogo profesional al recibir fotos del paciente: detecta hallazgos,
                  decide severidad y guía la conversación.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, vision_enabled: !form.vision_enabled })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                form.vision_enabled ? 'bg-lime-500' : 'bg-dark-500'
              }`}
              aria-label="Activar análisis clínico"
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  form.vision_enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div
            className={`space-y-5 transition-opacity ${
              form.vision_enabled ? 'opacity-100' : 'pointer-events-none opacity-40'
            }`}
          >
            {/* Sensibilidad */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Sensibilidad clínica</label>
              <div className="grid grid-cols-3 gap-2">
                {SENSITIVITIES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() =>
                      setForm({ ...form, vision_sensitivity: s.value as typeof form.vision_sensitivity })
                    }
                    className={`rounded-lg border px-3 py-2 text-left transition-all ${
                      form.vision_sensitivity === s.value
                        ? 'border-lime-500/50 bg-lime-500/10'
                        : 'border-dark-500 bg-dark-700 hover:border-dark-400'
                    }`}
                  >
                    <p
                      className={`text-xs font-medium ${
                        form.vision_sensitivity === s.value ? 'text-lime-400' : 'text-white'
                      }`}
                    >
                      {s.label}
                    </p>
                    <p className="text-[10px] text-zinc-500">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Áreas a priorizar */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Áreas clínicas a priorizar</label>
              <div className="flex flex-wrap gap-2">
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
                      className={`rounded-full border px-3 py-1 text-xs transition-all ${
                        active
                          ? 'border-lime-500/50 bg-lime-500/15 text-lime-300'
                          : 'border-dark-500 bg-dark-700 text-zinc-400 hover:border-dark-400'
                      }`}
                    >
                      {a.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-zinc-500">
                La IA enfocará su análisis aquí primero. Mínimo 1, recomendado 4-7.
              </p>
            </div>

            {/* Auto-sugerencia */}
            <div className="flex items-start justify-between gap-4 rounded-lg border border-dark-500 bg-dark-700/50 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 text-lime-400" />
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
                aria-label="Auto sugerencia"
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    form.vision_auto_suggest ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Disclaimer */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Disclaimer clínico</label>
              <textarea
                value={form.vision_disclaimer}
                onChange={(e) => setForm({ ...form, vision_disclaimer: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50"
                placeholder="Esto es una observación preliminar. El diagnóstico definitivo requiere valoración presencial."
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                La IA siempre añade esta frase al cerrar su análisis. Te protege legalmente.
              </p>
            </div>
          </div>
        </Card>

        {/* API Keys */}
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Key className="h-4 w-4 text-lime-400" />
            <h3 className="text-sm font-semibold text-white">Claves de API</h3>
          </div>
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-lime-500/20 bg-lime-500/5 px-3 py-2">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
            <p className="text-xs text-zinc-400">
              Las claves se encriptan con AES-256-GCM antes de guardarse. Nunca las devolvemos en claro.
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <Input
                label="Claude API Key"
                type="password"
                value={form.claude_api_key}
                onChange={(e) => setForm({ ...form, claude_api_key: e.target.value })}
                placeholder={config?.has_claude_key ? `Actual: ${config.claude_api_key_masked}` : 'sk-ant-api03-...'}
              />
              {config?.has_claude_key && (
                <p className="mt-1 text-xs text-lime-400/60">Clave configurada. Deja vacío para mantener la actual.</p>
              )}
            </div>
            <div>
              <Input
                label="ElevenLabs API Key (opcional)"
                type="password"
                value={form.elevenlabs_api_key}
                onChange={(e) => setForm({ ...form, elevenlabs_api_key: e.target.value })}
                placeholder={config?.has_elevenlabs_key ? `Actual: ${config.elevenlabs_api_key_masked}` : 'Opcional'}
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
