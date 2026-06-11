import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import { useAuth } from './useAuth'

interface AdminIdentity {
  user_id: string
  role: 'admin' | 'superadmin'
}

interface AdminCtx {
  isAdmin: boolean
  identity: AdminIdentity | null
  loading: boolean
  /** Re-verifica el estado de admin contra el backend. */
  refresh: () => Promise<void>
}

const AdminContext = createContext<AdminCtx | null>(null)

export function AdminProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [identity, setIdentity] = useState<AdminIdentity | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    if (!user) {
      setIdentity(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await api.get<AdminIdentity>('/admin/me')
    setIdentity(res.data)
    setLoading(false)
  }

  useEffect(() => {
    if (authLoading) return
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading])

  return (
    <AdminContext.Provider value={{ isAdmin: !!identity, identity, loading, refresh }}>
      {children}
    </AdminContext.Provider>
  )
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider')
  return ctx
}
