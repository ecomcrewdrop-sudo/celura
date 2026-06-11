import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useAppConfig } from '@/hooks/useAppConfig'
import { MessageSquare, Brain, CalendarDays, Users, Smartphone, TrendingUp, Sparkles, Mail } from 'lucide-react'

export default function Login() {
  const { signIn, signUp, user, loading: authLoading } = useAuth()
  const { config } = useAppConfig()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  if (authLoading) return null
  if (user) return <Navigate to="/" replace />

  const beta = config?.beta_mode === true
  const days = config?.beta_days ?? 14

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNeedsConfirmation(false)
    setLoading(true)
    const err = isRegister
      ? await signUp(email, password, fullName.trim() || undefined)
      : await signIn(email, password)
    setLoading(false)
    if (err === '__needs_confirmation__') {
      setNeedsConfirmation(true)
      return
    }
    if (err) {
      setError(err)
    } else {
      // Tras registro: el ClinicGuard te lleva a /onboarding si no hay clínica
      navigate('/')
    }
  }

  if (needsConfirmation) {
    return (
      <div className="flex min-h-dscreen items-center justify-center bg-white px-4 safe-px safe-pt safe-pb">
        <div className="mx-auto w-full max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1a6b50]/10">
            <Mail className="h-6 w-6 text-[#1a6b50]" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-dark-900 sm:text-3xl">Confirma tu correo</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Te enviamos un enlace a <span className="font-medium text-dark-900">{email}</span>.
            Ábrelo para activar tu cuenta y volver aquí.
          </p>
          <button
            onClick={() => { setNeedsConfirmation(false); setIsRegister(false) }}
            className="touch-target mt-6 inline-flex items-center justify-center px-4 text-sm font-medium text-[#1a6b50] hover:underline"
          >
            Volver a iniciar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dscreen bg-white">
      {/* Left Panel — Form */}
      <div className="flex w-full flex-col justify-center bg-white px-5 safe-px safe-pt safe-pb sm:px-8 lg:w-[480px] lg:min-w-[480px] lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <img src="/logo.svg" alt="Celura" className="mb-8 h-10 sm:mb-10" />

          <h1 className="text-2xl font-bold text-dark-900 sm:text-3xl">
            {isRegister ? 'Crea tu cuenta' : 'Bienvenido a Celura'}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {isRegister
              ? 'Registra tu clínica y empieza a automatizar'
              : 'Tu asistente dental con IA te espera'}
          </p>

          {isRegister && beta && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#1a6b50]/20 bg-[#1a6b50]/[0.06] px-3.5 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1a6b50] text-white">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#0d3f2e]">
                  Acceso anticipado · Plan PRO {days} días gratis
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-600">
                  Sin tarjeta. Cancelas cuando quieras al terminar.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isRegister && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-dark-900">
                  Nombre del doctor o responsable
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. María Pérez"
                  required
                  autoComplete="name"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-dark-900 outline-none transition-all placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-dark-900">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@clinica.com"
                required
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-dark-900 outline-none transition-all placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-dark-900">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                required
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-dark-900 outline-none transition-all placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="touch-target flex w-full items-center justify-center gap-2 rounded-lg bg-[#1a6b50] px-4 py-3.5 text-base font-semibold text-white transition-all hover:bg-[#15573f] active:scale-[0.98] disabled:opacity-50 sm:text-sm"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
                  <span className="ml-1">→</span>
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            {isRegister ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
            <button
              onClick={() => { setIsRegister(!isRegister); setError(null) }}
              className="inline-flex min-h-[44px] items-center justify-center px-1 font-medium text-[#1a6b50] hover:underline"
            >
              {isRegister ? 'Inicia sesión' : 'Crear cuenta'}
            </button>
          </p>
        </div>
      </div>

      {/* Right Panel — Showcase */}
      <div className="relative hidden flex-1 overflow-hidden bg-gradient-to-br from-[#1a6b50] via-[#155e45] to-[#0d3f2e] lg:block">
        {/* Decorative circles */}
        <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5" />
        <div className="absolute right-1/4 top-1/3 h-48 w-48 rounded-full bg-[#5DCAA5]/10" />

        {/* Floating Cards */}
        <div className="relative flex h-full items-center justify-center p-12">
          <div className="relative h-[520px] w-[480px]">

            {/* Card: Dashboard Preview */}
            <div className="absolute left-0 top-0 w-72 animate-fade-in rounded-2xl bg-white/95 p-5 shadow-2xl backdrop-blur-sm" style={{ animationDelay: '0.1s' }}>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a6b50]/10">
                  <Users className="h-4 w-4 text-[#1a6b50]" />
                </div>
                <span className="text-sm font-semibold text-dark-900">CRM Dental</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
                  <span className="text-xs text-zinc-600">María García</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Agendada</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
                  <span className="text-xs text-zinc-600">Carlos López</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Interesado</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
                  <span className="text-xs text-zinc-600">Ana Ruiz</span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">Contactada</span>
                </div>
              </div>
            </div>

            {/* Card: WhatsApp */}
            <div className="absolute right-0 top-8 w-56 animate-fade-in rounded-2xl bg-white/95 p-4 shadow-2xl backdrop-blur-sm" style={{ animationDelay: '0.3s' }}>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                  <Smartphone className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-sm font-semibold text-dark-900">WhatsApp</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                <span className="text-xs text-zinc-600">Conectado</span>
              </div>
              <div className="mt-2 rounded-lg bg-green-50 px-3 py-2">
                <p className="text-[10px] text-green-700">+24 mensajes atendidos hoy</p>
              </div>
            </div>

            {/* Card: AI Assistant */}
            <div className="absolute bottom-16 left-4 w-64 animate-fade-in rounded-2xl bg-white/95 p-4 shadow-2xl backdrop-blur-sm" style={{ animationDelay: '0.5s' }}>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                  <Brain className="h-4 w-4 text-purple-600" />
                </div>
                <span className="text-sm font-semibold text-dark-900">Asistente IA</span>
              </div>
              <div className="space-y-1.5">
                <div className="rounded-lg bg-zinc-100 px-3 py-2">
                  <p className="text-[11px] text-zinc-500">Paciente:</p>
                  <p className="text-xs text-zinc-700">Hola, quisiera agendar una limpieza</p>
                </div>
                <div className="rounded-lg bg-[#1a6b50]/10 px-3 py-2">
                  <p className="text-[11px] text-[#1a6b50]">Sofía (IA):</p>
                  <p className="text-xs text-zinc-700">¡Hola! Con gusto te agendo. ¿Prefieres mañana o pasado?</p>
                </div>
              </div>
            </div>

            {/* Card: Appointments */}
            <div className="absolute bottom-4 right-2 w-52 animate-fade-in rounded-2xl bg-white/95 p-4 shadow-2xl backdrop-blur-sm" style={{ animationDelay: '0.7s' }}>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                </div>
                <span className="text-sm font-semibold text-dark-900">Citas</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-dark-900">12</span>
                <span className="text-xs text-zinc-500">esta semana</span>
              </div>
              <div className="mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-500" />
                <span className="text-xs text-emerald-600">+18% vs anterior</span>
              </div>
            </div>

            {/* Card: Messages counter */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-fade-in rounded-2xl bg-white/95 p-4 shadow-2xl backdrop-blur-sm" style={{ animationDelay: '0.4s' }}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a6b50]">
                  <MessageSquare className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-lg font-bold text-dark-900">+2,400</p>
                  <p className="text-[11px] text-zinc-500">Pacientes atendidos</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom tagline */}
        <div className="absolute bottom-8 left-0 right-0 text-center">
          <p className="text-sm font-medium text-white/80">
            Automatiza tu clínica dental con inteligencia artificial
          </p>
        </div>
      </div>
    </div>
  )
}
