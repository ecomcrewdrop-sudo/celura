import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { ClinicProvider, useClinic } from '@/hooks/useClinic'
import { AdminProvider } from '@/hooks/useAdmin'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Onboarding from '@/pages/Onboarding'
import DashboardHome from '@/pages/DashboardHome'
import Leads from '@/pages/Leads'
import Appointments from '@/pages/Appointments'
import Conversations from '@/pages/Conversations'
import WhatsAppPage from '@/pages/WhatsApp'
import Workflows from '@/pages/Workflows'
import Settings from '@/pages/Settings'
import AdminLayout from '@/components/admin/AdminLayout'
import AdminOverview from '@/pages/admin/AdminOverview'
import AdminClinics from '@/pages/admin/AdminClinics'
import AdminUsers from '@/pages/admin/AdminUsers'
import AdminAnnouncements from '@/pages/admin/AdminAnnouncements'
import AdminLogs from '@/pages/admin/AdminLogs'
import AdminWASessions from '@/pages/admin/AdminWASessions'

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
        <AdminProvider>
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

            {/* Panel admin (rol verificado dentro de AdminLayout) */}
            <Route
              path="/admin"
              element={
                <AuthGuard>
                  <AdminLayout />
                </AuthGuard>
              }
            >
              <Route index element={<AdminOverview />} />
              <Route path="clinics" element={<AdminClinics />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="announcements" element={<AdminAnnouncements />} />
              <Route path="wa-sessions" element={<AdminWASessions />} />
              <Route path="logs" element={<AdminLogs />} />
            </Route>

            {/* Dashboard normal (clínica) */}
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
              <Route path="workflows" element={<Workflows />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AdminProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
