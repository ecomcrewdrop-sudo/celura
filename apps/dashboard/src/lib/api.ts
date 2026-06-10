import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

const DEFAULT_TIMEOUT_MS = 20_000

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T | null; error: string | null; status: number }> {
  let token = ''
  try {
    token = await getToken()
  } catch {
    return { data: null, error: 'Sesión no disponible', status: 0 }
  }

  // Timeout duro: si el server no responde en 20s, abortamos
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const aborted = (err as { name?: string })?.name === 'AbortError'
    return {
      data: null,
      error: aborted
        ? 'El servidor tardó demasiado en responder. Reintenta en un momento.'
        : 'No se pudo conectar con el servidor. Revisa tu conexión.',
      status: 0,
    }
  }
  clearTimeout(timer)

  let data: T | null = null
  let error: string | null = null
  try {
    const json = await res.json()
    if (res.ok) {
      data = json as T
    } else {
      error = (json as { error?: string }).error ?? `Error ${res.status}`
    }
  } catch {
    error = res.ok ? null : `Error ${res.status}`
  }

  return { data, error, status: res.status }
}

export const api = {
  get: <T = unknown>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T = unknown>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = unknown>(path: string) => request<T>('DELETE', path),
}
