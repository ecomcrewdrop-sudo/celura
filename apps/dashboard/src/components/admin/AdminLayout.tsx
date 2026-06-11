import { useState, useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { Menu, ShieldCheck } from 'lucide-react'
import AdminSidebar from './AdminSidebar'
import { useAdmin } from '@/hooks/useAdmin'

export default function AdminLayout() {
  const { isAdmin, loading } = useAdmin()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  if (loading) {
    return (
      <div className="flex min-h-dscreen items-center justify-center bg-dark-900">
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
    <div className="min-h-dscreen bg-dark-900">
      <AdminSidebar open={open} onClose={() => setOpen(false)} />

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="animate-backdrop-in fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          aria-hidden
        />
      )}

      <main className="min-h-dscreen lg:ml-64">
        {/* Mobile top bar */}
        <header className="safe-pt sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.06] bg-dark-900/80 px-4 py-3 backdrop-blur-md lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="touch-target -ml-2 flex items-center justify-center rounded-xl px-2 text-zinc-300 transition-colors hover:bg-white/[0.04] active:bg-white/[0.08]"
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-white">Admin</span>
          </div>
          <div className="w-10" />
        </header>

        <div className="safe-px mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>

        <div className="safe-pb" />
      </main>
    </div>
  )
}
