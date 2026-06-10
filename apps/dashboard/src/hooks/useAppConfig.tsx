// ============================================================
//  CELURA · Config pública del API (sin auth)
//  Sirve para saber si el sistema está en modo beta y mostrar
//  los banners correspondientes en login/onboarding.
// ============================================================

import { useEffect, useState } from 'react'

interface AppConfig {
  beta_mode: boolean
  beta_days: number
  trial_days: number
}

const API_URL = import.meta.env.VITE_API_URL

let cache: AppConfig | null = null
let inflight: Promise<AppConfig | null> | null = null

async function fetchConfig(): Promise<AppConfig | null> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/config`)
      if (!res.ok) return null
      const data = (await res.json()) as AppConfig
      cache = data
      return data
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(cache)
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    if (cache) {
      setConfig(cache)
      setLoading(false)
      return
    }
    fetchConfig().then((c) => {
      setConfig(c)
      setLoading(false)
    })
  }, [])

  return { config, loading }
}
