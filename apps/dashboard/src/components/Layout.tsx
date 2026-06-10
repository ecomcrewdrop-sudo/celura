import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import Sidebar from './Sidebar'
import { useClinic } from '@/hooks/useClinic'

export default function Layout() {
  const { refresh } = useClinic()
  useEffect(() => { refresh() }, [refresh])

  return (
    <div className="min-h-screen bg-dark-900">
      <Sidebar />
      <main className="ml-64 min-h-screen">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
