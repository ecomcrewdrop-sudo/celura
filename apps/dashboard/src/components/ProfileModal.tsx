// ============================================================
//  ProfileModal · sistema completo de usuario y perfil
//  Tabs: Perfil · Cuenta · Plan · Sesión
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import {
  X,
  UserRound,
  AtSign,
  KeyRound,
  Crown,
  LogOut,
  Building2,
  MapPin,
  Phone,
  Globe,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  CalendarClock,
  ShieldCheck,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/hooks/useAuth'
import { useClinic } from '@/hooks/useClinic'
import { api } from '@/lib/api'
import Avatar from './Avatar'

interface Props {
  open: boolean
  onClose: () => void
  initialTab?: TabKey
}

type TabKey = 'profile' | 'account' | 'plan' | 'session'

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'profile', label: 'Perfil',  icon: UserRound },
  { key: 'account', label: 'Cuenta',  icon: AtSign },
  { key: 'plan',    label: 'Plan',    icon: Crown },
  { key: 'session', label: 'Sesión',  icon: ShieldCheck },
]

const COUNTRY_OPTIONS = [
  { code: 'CO', name: 'Colombia' },
  { code: 'MX', name: 'México' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'PE', name: 'Perú' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'ES', name: 'España' },
  { code: 'US', name: 'Estados Unidos' },
]

function daysLeft(iso: string | null): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (Number.isNaN(ms)) return null
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

function planMeta(plan: string): { label: string; tint: string; description: string } {
  switch (plan) {
    case 'pro':
      return { label: 'PRO', tint: 'bg-lime-500/15 text-lime-300 ring-lime-500/30', description: 'Asistente avanzado, análisis clínico y flujos sin límite.' }
    case 'esencial':
      return { label: 'Esencial', tint: 'bg-sky-500/15 text-sky-300 ring-sky-500/30', description: 'Conversaciones y agenda automatizada.' }
    case 'clinica':
      return { label: 'Clínica', tint: 'bg-violet-500/15 text-violet-300 ring-violet-500/30', description: 'Multiusuario, reportes y consultoría dedicada.' }
    default:
      return { label: 'Trial', tint: 'bg-amber-500/15 text-amber-300 ring-amber-500/30', description: 'Acceso completo durante tu período de prueba.' }
  }
}

export default function ProfileModal({ open, onClose, initialTab = 'profile' }: Props) {
  const { user, signOut, updateProfile, updateEmail, updatePassword } = useAuth()
  const { clinic, config, refresh } = useClinic()
  const [tab, setTab] = useState<TabKey>(initialTab)

  // Estado de formularios
  const [fullName, setFullName] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('CO')

  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // UI state
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState<TabKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Bloquear scroll del body cuando está abierto + reset al abrir
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setError(null)
    setInfo(null)
    setSavedFlash(null)
    setFullName((user?.user_metadata?.['full_name'] as string | undefined) ?? '')
    setClinicName(clinic?.name ?? '')
    setPhone(clinic?.phone ?? '')
    setCity(clinic?.city ?? '')
    setCountry(clinic?.country ?? 'CO')
    setEmail(user?.email ?? '')
    setNewPassword('')
    setConfirmPassword('')
  }, [open, initialTab, user, clinic])

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const displayName = useMemo(() => {
    return fullName.trim() || clinic?.name || user?.email?.split('@')[0] || 'Usuario'
  }, [fullName, clinic?.name, user?.email])

  const meta = useMemo(() => planMeta(clinic?.plan ?? 'trial'), [clinic?.plan])
  const trialDays = useMemo(() => daysLeft(clinic?.trial_ends_at ?? null), [clinic?.trial_ends_at])

  // Detectar cambios dirty
  const profileDirty =
    (fullName || '') !== (((user?.user_metadata?.['full_name'] as string | undefined) ?? '')) ||
    clinicName !== (clinic?.name ?? '') ||
    (phone || '') !== (clinic?.phone ?? '') ||
    (city || '') !== (clinic?.city ?? '') ||
    country !== (clinic?.country ?? 'CO')

  const accountEmailDirty = email.trim() !== (user?.email ?? '')
  const passwordReady = newPassword.length >= 8 && newPassword === confirmPassword

  const flash = (key: TabKey) => {
    setSavedFlash(key)
    setTimeout(() => setSavedFlash(null), 1800)
  }

  const handleSaveProfile = async () => {
    if (!profileDirty || saving) return
    setSaving(true); setError(null); setInfo(null)

    // 1) Profile (Supabase auth metadata) — solo si cambió full_name
    if ((fullName || '') !== (((user?.user_metadata?.['full_name'] as string | undefined) ?? ''))) {
      const err = await updateProfile({ full_name: fullName.trim() })
      if (err) { setError(err); setSaving(false); return }
    }

    // 2) Clínica (backend)
    const clinicChanges: Record<string, unknown> = {}
    if (clinicName !== (clinic?.name ?? '')) clinicChanges['name'] = clinicName.trim()
    if ((phone || '') !== (clinic?.phone ?? '')) clinicChanges['phone'] = phone.trim() || null
    if ((city || '') !== (clinic?.city ?? '')) clinicChanges['city'] = city.trim() || null
    if (country !== (clinic?.country ?? 'CO')) clinicChanges['country'] = country

    if (Object.keys(clinicChanges).length > 0) {
      const res = await api.patch('/api/clinics/me', clinicChanges)
      if (res.error) { setError(res.error); setSaving(false); return }
      await refresh()
    }

    flash('profile')
    setSaving(false)
  }

  const handleSaveEmail = async () => {
    if (!accountEmailDirty || saving) return
    setSaving(true); setError(null); setInfo(null)
    const err = await updateEmail(email.trim())
    if (err) { setError(err); setSaving(false); return }
    setInfo('Revisa tu correo: te enviamos un enlace para confirmar el cambio.')
    flash('account')
    setSaving(false)
  }

  const handleSavePassword = async () => {
    if (!passwordReady || saving) return
    setSaving(true); setError(null); setInfo(null)
    const err = await updatePassword(newPassword)
    if (err) { setError(err); setSaving(false); return }
    setNewPassword(''); setConfirmPassword('')
    setInfo('Contraseña actualizada. Úsala la próxima vez que inicies sesión.')
    flash('account')
    setSaving(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div className="animate-scale-in relative grid w-full max-w-3xl grid-cols-[200px_1fr] overflow-hidden rounded-2xl border border-white/[0.08] bg-dark-800 shadow-2xl shadow-black/40">
        {/* ─── Sidebar de tabs ─── */}
        <div className="border-r border-white/[0.06] bg-dark-900/40 px-3 py-5">
          <div className="mb-4 px-2">
            <div className="flex items-center gap-3">
              <Avatar name={displayName} size="sm" ring />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-white">{displayName}</p>
                <p className="truncate text-[11px] text-zinc-500">{user?.email}</p>
              </div>
            </div>
          </div>

          <nav className="space-y-0.5">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setError(null); setInfo(null) }}
                className={clsx(
                  'group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
                  tab === key
                    ? 'bg-white/[0.06] text-white'
                    : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
                )}
              >
                <Icon className="h-[15px] w-[15px]" />
                <span className="flex-1">{label}</span>
                {savedFlash === key && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-lime-500/20 text-lime-300">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* ─── Contenido ─── */}
        <div className="relative flex flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                {TABS.find(t => t.key === tab)?.label}
              </h2>
              <p className="text-[11px] text-zinc-500">
                {tab === 'profile' && 'Cómo te ven tus pacientes y cómo te identificamos en Celura.'}
                {tab === 'account' && 'Tus credenciales de acceso a la plataforma.'}
                {tab === 'plan'    && 'Tu suscripción y beneficios activos.'}
                {tab === 'session' && 'Cierra sesión o sal de tu cuenta.'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
            {/* Mensajes globales */}
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {info && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{info}</span>
              </div>
            )}

            {/* ─── Tab: Perfil ─── */}
            {tab === 'profile' && (
              <div className="space-y-6">
                <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <Avatar name={displayName} size="xl" ring />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-white">{displayName}</p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">{user?.email}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1', meta.tint)}>
                        {meta.label}
                      </span>
                      {config?.wa_connected ? (
                        <span className="flex items-center gap-1 rounded-md bg-lime-500/10 px-1.5 py-0.5 text-[10px] font-medium text-lime-300 ring-1 ring-lime-500/20">
                          <span className="h-1 w-1 rounded-full bg-lime-400" />
                          WhatsApp activo
                        </span>
                      ) : (
                        <span className="rounded-md bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-white/[0.06]">
                          WhatsApp inactivo
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Datos personales */}
                <FieldGroup title="Datos personales" subtitle="Cómo te llamamos dentro del panel.">
                  <Field icon={UserRound} label="Tu nombre">
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Dr. Santiago Gómez"
                      className={fieldInputCls}
                    />
                  </Field>
                </FieldGroup>

                {/* Datos de la clínica */}
                <FieldGroup title="Tu clínica" subtitle="Identidad visible para tus pacientes y mensajes.">
                  <Field icon={Building2} label="Nombre de la clínica">
                    <input
                      type="text"
                      value={clinicName}
                      onChange={e => setClinicName(e.target.value)}
                      placeholder="Clínica Sonrisa"
                      className={fieldInputCls}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field icon={Phone} label="Teléfono">
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+57 300 123 4567"
                        className={fieldInputCls}
                      />
                    </Field>
                    <Field icon={MapPin} label="Ciudad">
                      <input
                        type="text"
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        placeholder="Cali"
                        className={fieldInputCls}
                      />
                    </Field>
                  </div>
                  <Field icon={Globe} label="País">
                    <select
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                      className={fieldInputCls}
                    >
                      {COUNTRY_OPTIONS.map(c => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </select>
                  </Field>
                </FieldGroup>

                <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-2 border-t border-white/[0.06] bg-dark-800/95 px-6 py-3 backdrop-blur">
                  <span className="mr-auto text-[11px] text-zinc-500">
                    {profileDirty ? 'Tienes cambios sin guardar.' : 'Todo está al día.'}
                  </span>
                  <button
                    onClick={handleSaveProfile}
                    disabled={!profileDirty || saving}
                    className={clsx(
                      'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition',
                      profileDirty && !saving
                        ? 'bg-lime-500 text-dark-900 hover:bg-lime-400'
                        : 'bg-white/[0.04] text-zinc-600',
                    )}
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Guardar cambios
                  </button>
                </div>
              </div>
            )}

            {/* ─── Tab: Cuenta ─── */}
            {tab === 'account' && (
              <div className="space-y-6">
                <FieldGroup title="Correo electrónico" subtitle="Lo usas para iniciar sesión y recibir notificaciones.">
                  <Field icon={AtSign} label="Correo">
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className={fieldInputCls}
                    />
                  </Field>
                  <div className="flex items-center justify-end">
                    <button
                      onClick={handleSaveEmail}
                      disabled={!accountEmailDirty || saving}
                      className={clsx(
                        'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition',
                        accountEmailDirty && !saving
                          ? 'bg-lime-500 text-dark-900 hover:bg-lime-400'
                          : 'bg-white/[0.04] text-zinc-600',
                      )}
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AtSign className="h-3.5 w-3.5" />}
                      Cambiar correo
                    </button>
                  </div>
                </FieldGroup>

                <FieldGroup title="Contraseña" subtitle="Mínimo 8 caracteres. Te recomendamos mezclar letras y números.">
                  <Field icon={KeyRound} label="Nueva contraseña">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className={fieldInputCls}
                    />
                  </Field>
                  <Field icon={KeyRound} label="Confirmar contraseña">
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className={fieldInputCls}
                    />
                  </Field>
                  {newPassword.length > 0 && newPassword !== confirmPassword && confirmPassword.length > 0 && (
                    <p className="text-[11px] text-amber-300">Las contraseñas no coinciden.</p>
                  )}
                  <div className="flex items-center justify-end">
                    <button
                      onClick={handleSavePassword}
                      disabled={!passwordReady || saving}
                      className={clsx(
                        'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition',
                        passwordReady && !saving
                          ? 'bg-lime-500 text-dark-900 hover:bg-lime-400'
                          : 'bg-white/[0.04] text-zinc-600',
                      )}
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                      Actualizar contraseña
                    </button>
                  </div>
                </FieldGroup>
              </div>
            )}

            {/* ─── Tab: Plan ─── */}
            {tab === 'plan' && (
              <div className="space-y-5">
                <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-transparent p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-amber-300" />
                        <h3 className="text-sm font-semibold text-white">Tu plan</h3>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{meta.description}</p>
                    </div>
                    <span className={clsx('rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1', meta.tint)}>
                      {meta.label}
                    </span>
                  </div>

                  {(clinic?.plan === 'trial' || clinic?.is_beta) && trialDays !== null && (
                    <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="flex items-center gap-2 text-xs text-amber-200">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {trialDays === 0
                          ? 'Tu prueba termina hoy.'
                          : trialDays === 1
                          ? 'Tu prueba termina mañana.'
                          : `Te quedan ${trialDays} días de prueba.`}
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full bg-gradient-to-r from-amber-400 to-lime-400 transition-all"
                          style={{ width: `${Math.min(100, (trialDays / 14) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                    <FeatureRow ok label="WhatsApp Business" />
                    <FeatureRow ok label="Asistente Claude" />
                    <FeatureRow ok label="Citas + recordatorios" />
                    <FeatureRow ok label="Pipeline de leads" />
                    <FeatureRow ok={clinic?.plan === 'pro' || clinic?.plan === 'clinica'} label="Análisis clínico (visión)" />
                    <FeatureRow ok={clinic?.plan === 'clinica'} label="Multiusuario" />
                  </div>
                </div>

                <a
                  href="https://celura.clinic/pricing"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/[0.04]"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">¿Necesitas más? Ver planes</p>
                    <p className="text-[11px] text-zinc-500">Sube de plan en cualquier momento sin perder tus datos.</p>
                  </div>
                  <Sparkles className="h-4 w-4 text-lime-400" />
                </a>
              </div>
            )}

            {/* ─── Tab: Sesión ─── */}
            {tab === 'session' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <h3 className="text-sm font-semibold text-white">Sesión activa</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Estás conectado como <span className="text-zinc-300">{user?.email}</span>.
                  </p>
                  <button
                    onClick={async () => { await signOut(); onClose() }}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.07]"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Cerrar sesión en este dispositivo
                  </button>
                </div>

                <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4">
                  <h3 className="text-sm font-semibold text-red-300">Zona peligrosa</h3>
                  <p className="mt-1 text-xs text-zinc-400">
                    Para cancelar tu cuenta o eliminar todos tus datos escríbenos a{' '}
                    <a href="mailto:hola@celura.clinic" className="text-red-300 underline-offset-2 hover:underline">
                      hola@celura.clinic
                    </a>.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers UI ────────────────────────────────────────────
const fieldInputCls =
  'w-full rounded-lg border border-white/[0.08] bg-dark-900/60 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-lime-500/40 focus:bg-dark-900/80'

function FieldGroup({
  title,
  subtitle,
  children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-[11px] text-zinc-500">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Field({
  icon: Icon,
  label,
  children,
}: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      {children}
    </label>
  )
}

function FeatureRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={clsx('flex items-center gap-1.5 rounded-md px-2 py-1', ok ? 'text-zinc-300' : 'text-zinc-600')}>
      <span className={clsx(
        'flex h-3.5 w-3.5 items-center justify-center rounded-full',
        ok ? 'bg-lime-500/20 text-lime-300' : 'bg-white/[0.04] text-zinc-600',
      )}>
        <Check className="h-2.5 w-2.5" />
      </span>
      {label}
    </div>
  )
}
