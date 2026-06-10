import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { api } from '@/lib/api'

interface Clinic {
  id: string
  name: string
  slug: string
  plan: string
  status: string
  trial_ends_at: string | null
  phone: string | null
  city: string | null
  country: string
  is_beta?: boolean
  beta_started_at?: string | null
}

interface Config {
  id: string
  clinic_id: string
  assistant_name: string
  tone: string
  greeting: string
  farewell: string
  treatments: string[]
  schedule: Record<string, string | null>
  custom_prompt: string
  escalate_on: string[]
  wa_connected: boolean
  wa_phone: string | null
  vision_enabled: boolean
  vision_sensitivity: 'conservative' | 'balanced' | 'thorough'
  vision_focus: string[]
  vision_auto_suggest: boolean
  vision_disclaimer: string
  has_claude_key: boolean
  has_elevenlabs_key: boolean
  claude_api_key_masked: string | null
  elevenlabs_api_key_masked: string | null
}

interface ClinicCtx {
  clinic: Clinic | null
  config: Config | null
  loading: boolean
  error: string | null
  status: number | null
  refresh: () => Promise<void>
}

const ClinicContext = createContext<ClinicCtx | null>(null)

export function ClinicProvider({ children }: { children: ReactNode }) {
  const [clinic, setClinic] = useState<Clinic | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await api.get<{ clinic: Clinic; config: Config }>('/api/clinics/me')
    setStatus(res.status)
    if (res.data) {
      setClinic(res.data.clinic)
      setConfig(res.data.config)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return (
    <ClinicContext.Provider value={{ clinic, config, loading, error, status, refresh }}>
      {children}
    </ClinicContext.Provider>
  )
}

export function useClinic() {
  const ctx = useContext(ClinicContext)
  if (!ctx) throw new Error('useClinic must be used within ClinicProvider')
  return ctx
}
