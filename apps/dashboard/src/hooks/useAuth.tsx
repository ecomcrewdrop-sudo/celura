import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthCtx {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, fullName?: string) => Promise<string | null>
  signOut: () => Promise<void>
  updateProfile: (input: { full_name?: string; avatar_url?: string | null }) => Promise<string | null>
  updateEmail: (email: string) => Promise<string | null>
  updatePassword: (password: string) => Promise<string | null>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_ev, s) => {
      setSession(s)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: fullName ? { full_name: fullName } : undefined,
      },
    })
    if (error) return error.message
    // Si Supabase tiene "Confirm email" activo, no habrá sesión hasta confirmar.
    // Avisamos para que el frontend pueda mostrarlo claramente.
    if (!data.session) {
      return '__needs_confirmation__'
    }
    return null
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  const updateProfile = async (input: { full_name?: string; avatar_url?: string | null }) => {
    const data: Record<string, unknown> = {}
    if (input.full_name !== undefined) data['full_name'] = input.full_name
    if (input.avatar_url !== undefined) data['avatar_url'] = input.avatar_url
    if (Object.keys(data).length === 0) return null
    const { data: res, error } = await supabase.auth.updateUser({ data })
    if (error) return error.message
    if (res.user) setSession(s => (s ? { ...s, user: res.user } : s))
    return null
  }

  const updateEmail = async (email: string) => {
    const { error } = await supabase.auth.updateUser({ email })
    if (error) return error.message
    return null
  }

  const updatePassword = async (password: string) => {
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres'
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return error.message
    return null
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        updateProfile,
        updateEmail,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
