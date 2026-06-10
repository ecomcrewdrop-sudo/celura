import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useClinic } from '@/hooks/useClinic'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Button from '@/components/Button'
import Input from '@/components/Input'
import { Save, Key, Shield } from 'lucide-react'

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
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
      })
    }
  }, [config])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    const body: Record<string, unknown> = {
      assistant_name: form.assistant_name,
      tone: form.tone,
      greeting: form.greeting,
      farewell: form.farewell,
      custom_prompt: form.custom_prompt,
      treatments: form.treatments.split(',').map((t) => t.trim()).filter(Boolean),
      escalate_on: form.escalate_on.split(',').map((t) => t.trim()).filter(Boolean),
      schedule: form.schedule,
    }
    if (form.claude_api_key) body.claude_api_key = form.claude_api_key
    if (form.elevenlabs_api_key) body.elevenlabs_api_key = form.elevenlabs_api_key

    const res = await api.patch('/api/clinics/me/config', body)
    setSaving(false)
    if (!res.error) {
      setSaved(true)
      setForm((f) => ({ ...f, claude_api_key: '', elevenlabs_api_key: '' }))
      refresh()
      setTimeout(() => setSaved(false), 3000)
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Configuración"
        subtitle="Personaliza tu asistente IA"
        action={
          <Button onClick={handleSave} loading={saving}>
            <Save className="h-4 w-4" /> {saved ? 'Guardado!' : 'Guardar cambios'}
          </Button>
        }
      />

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
