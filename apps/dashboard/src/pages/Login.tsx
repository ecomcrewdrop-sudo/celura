import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import Input from '@/components/Input'
import Button from '@/components/Button'
import { Stethoscope } from 'lucide-react'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const err = isRegister ? await signUp(email, password) : await signIn(email, password)
    setLoading(false)
    if (err) {
      setError(err)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-900 px-4">
      <div className="animate-fade-in w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lime-500/20">
            <Stethoscope className="h-7 w-7 text-lime-400" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Celura</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {isRegister ? 'Crea tu cuenta' : 'Entra a tu dashboard'}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="doctor@clinica.com"
            required
          />
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            minLength={6}
            required
          />

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full">
            {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          {isRegister ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
          <button
            onClick={() => { setIsRegister(!isRegister); setError(null) }}
            className="text-lime-400 hover:text-lime-300"
          >
            {isRegister ? 'Inicia sesión' : 'Regístrate'}
          </button>
        </p>
      </div>
    </div>
  )
}
