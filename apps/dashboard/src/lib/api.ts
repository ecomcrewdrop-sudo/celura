import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T | null; error: string | null; status: number }> {
  const token = await getToken()
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  let data: T | null = null
  let error: string | null = null
  try {
    const json = await res.json()
    if (res.ok) {
      data = json as T
    } else {
      error = json.error ?? `Error ${res.status}`
    }
  } catch {
    error = `Error ${res.status}`
  }

  return { data, error, status: res.status }
}

export const api = {
  get: <T = unknown>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T = unknown>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = unknown>(path: string) => request<T>('DELETE', path),
}
