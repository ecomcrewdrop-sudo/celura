import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { ClinicProvider, useClinic } from '@/hooks/useClinic'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Onboarding from '@/pages/Onboarding'
import DashboardHome from '@/pages/DashboardHome'
import Leads from '@/pages/Leads'
import Appointments from '@/pages/Appointments'
import Conversations from '@/pages/Conversations'
import WhatsAppPage from '@/pages/WhatsApp'
import Settings from '@/pages/Settings'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <SplashScreen />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function ClinicGuard({ children }: { children: React.ReactNode }) {
  const { clinic, loading, error, status } = useClinic()
  if (loading) return <SplashScreen />
  if (status === 401) return <Navigate to="/login" replace />
  if (status === 403 || (!clinic && !loading)) {
    return <Navigate to="/onboarding" replace />
  }
  return <>{children}</>
}

function SplashScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-900">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" />
        <p className="text-sm text-zinc-500">Cargando...</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/onboarding"
            element={
              <AuthGuard>
                <Onboarding />
              </AuthGuard>
            }
          />
          <Route
            element={
              <AuthGuard>
                <ClinicProvider>
                  <ClinicGuard>
                    <Layout />
                  </ClinicGuard>
                </ClinicProvider>
              </AuthGuard>
            }
          >
            <Route index element={<DashboardHome />} />
            <Route path="leads" element={<Leads />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="conversations" element={<Conversations />} />
            <Route path="whatsapp" element={<WhatsAppPage />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
