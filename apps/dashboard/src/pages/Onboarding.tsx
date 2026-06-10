import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAppConfig } from '@/hooks/useAppConfig'
import Input from '@/components/Input'
import Button from '@/components/Button'
import { ArrowRight, Sparkles } from 'lucide-react'

export default function Onboarding() {
  const navigate = useNavigate()
  const { config } = useAppConfig()
  const beta = config?.beta_mode === true
  const days = config?.beta_days ?? 14
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNameChange = (v: string) => {
    setName(v)
    setSlug(
      v.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 60),
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await api.post('/onboarding/clinic', {
      name,
      slug,
      phone: phone || undefined,
      city: city || undefined,
      country: 'MX',
    })
    setLoading(false)
    if (res.error) {
      setError(res.error)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-900 px-4">
      <div className="animate-fade-in w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-4">
          <img src="/logo-dark.svg" alt="Celura" className="h-10" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Configura tu clínica</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Solo toma un minuto. Después podrás conectar WhatsApp.
            </p>
          </div>
        </div>

        {beta && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-lime-500/20 bg-lime-500/[0.06] px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime-500/15 text-lime-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">
                Acceso beta · Plan PRO {days} días gratis
              </p>
              <p className="text-[11px] text-zinc-500">
                Al crear tu clínica activas todas las funciones automáticamente.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nombre de la clínica"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Clínica Sonrisa Perfecta"
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">Identificador</label>
            <div className="flex items-center rounded-lg border border-dark-500 bg-dark-700">
              <span className="pl-3 text-sm text-zinc-500">celura.clinic/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/g, ''))}
                className="flex-1 bg-transparent px-1 py-2.5 text-sm text-white outline-none"
                required
              />
            </div>
          </div>
          <Input
            label="Teléfono (opcional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+52 55 1234 5678"
          />
          <Input
            label="Ciudad (opcional)"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Ciudad de México"
          />

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Crear clínica <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
