import { Outlet, Navigate } from 'react-router-dom'
import AdminSidebar from './AdminSidebar'
import { useAdmin } from '@/hooks/useAdmin'

export default function AdminLayout() {
  const { isAdmin, loading } = useAdmin()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          <p className="text-sm text-zinc-500">Verificando permisos…</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <AdminSidebar />
      <main className="ml-64 min-h-screen">
        <div className="mx-auto max-w-7xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
