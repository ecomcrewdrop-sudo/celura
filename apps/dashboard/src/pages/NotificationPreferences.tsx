// ============================================================
//  CELURA · Preferencias de notificaciones
//  ------------------------------------------------------------
//  Toggle por kind y canal (email / in-app). Defaults sensatos
//  del backend. Cada cambio se persiste por PATCH inmediato.
// ============================================================

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import {
  Mail,
  Smartphone,
  CalendarPlus,
  CalendarX,
  CalendarSync,
  Clock,
  UserPlus,
  AlertTriangle,
  MessageSquare,
  Wifi,
  WifiOff,
  Sparkles,
  CreditCard,
  BarChart3,
  Megaphone,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import clsx from 'clsx'

interface Pref {
  kind: string
  email_enabled: boolean
  inapp_enabled: boolean
  updated_at: string
}

interface Section {
  title: string
  desc: string
  items: {
    kind: string
    label: string
    desc: string
    icon: React.ComponentType<{ className?: string }>
    // Defaults reales del backend
    defaultEmail: boolean
    defaultInapp: boolean
  }[]
}

const SECTIONS: Section[] = [
  {
    title: 'Citas',
    desc: 'Todo lo que pasa con la agenda de tus pacientes',
    items: [
      { kind: 'appointment_new',           label: 'Cita nueva',                desc: 'Cuando se agenda una cita',           icon: CalendarPlus, defaultEmail: true,  defaultInapp: true },
      { kind: 'appointment_reminder_24h',  label: 'Recordatorio 24h',          desc: 'Te avisamos antes de cada cita',      icon: Clock,        defaultEmail: true,  defaultInapp: true },
      { kind: 'appointment_cancelled',     label: 'Cita cancelada',            desc: 'Paciente o no_show cancela',          icon: CalendarX,    defaultEmail: true,  defaultInapp: true },
      { kind: 'appointment_rescheduled',   label: 'Cita reprogramada',         desc: 'Cuando se mueve a otro horario',      icon: CalendarSync, defaultEmail: true,  defaultInapp: true },
    ],
  },
  {
    title: 'Pacientes',
    desc: 'Nuevos leads y mensajes urgentes',
    items: [
      { kind: 'lead_new',         label: 'Paciente nuevo',         desc: 'Se crea un lead',                       icon: UserPlus,        defaultEmail: true,  defaultInapp: true },
      { kind: 'lead_high_value',  label: 'Paciente urgente',       desc: 'Urgencia alta o emergencia',            icon: AlertTriangle,   defaultEmail: false, defaultInapp: true },
      { kind: 'message_urgent',   label: 'Mensaje urgente',        desc: 'IA detecta dolor o emergencia',         icon: MessageSquare,   defaultEmail: false, defaultInapp: true },
    ],
  },
  {
    title: 'WhatsApp',
    desc: 'Estado de tu sesión conectada',
    items: [
      { kind: 'wa_connected',     label: 'WhatsApp conectado',      desc: 'Cuando tu línea entra en línea',       icon: Wifi,    defaultEmail: true, defaultInapp: true },
      { kind: 'wa_disconnected',  label: 'WhatsApp desconectado',   desc: 'Si tu línea se desconecta',            icon: WifiOff, defaultEmail: true, defaultInapp: true },
    ],
  },
  {
    title: 'Cuenta y plan',
    desc: 'Trial, pagos y mensajes del equipo',
    items: [
      { kind: 'trial_ending',      label: 'Trial por terminar',         desc: 'T-3 / T-1 / T-0 de tu prueba',        icon: Clock,        defaultEmail: true, defaultInapp: true },
      { kind: 'trial_ended',       label: 'Trial terminó',              desc: 'Cuando expira tu prueba',             icon: Clock,        defaultEmail: true, defaultInapp: true },
      { kind: 'payment_received',  label: 'Pago recibido',              desc: 'Confirmación de cobro',               icon: CreditCard,   defaultEmail: true, defaultInapp: true },
      { kind: 'daily_summary',     label: 'Resumen diario',             desc: 'Cada mañana, lo de ayer',             icon: BarChart3,    defaultEmail: true, defaultInapp: true },
      { kind: 'admin_announcement', label: 'Avisos del equipo Celura',  desc: 'Novedades importantes',               icon: Megaphone,    defaultEmail: true, defaultInapp: true },
      { kind: 'welcome',           label: 'Bienvenida',                 desc: 'Solo se envía 1 vez',                 icon: Sparkles,     defaultEmail: true, defaultInapp: true },
    ],
  },
]

export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Record<string, Pref>>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await api.get<{ preferences: Pref[] }>('/api/notifications/preferences')
      if (res.data) {
        const map: Record<string, Pref> = {}
        res.data.preferences.forEach((p) => {
          map[p.kind] = p
        })
        setPrefs(map)
      }
      setLoading(false)
    })()
  }, [])

  const getValue = (kind: string, channel: 'email' | 'inapp', dflt: boolean): boolean => {
    const p = prefs[kind]
    if (!p) return dflt
    return channel === 'email' ? p.email_enabled : p.inapp_enabled
  }

  const toggle = async (kind: string, channel: 'email' | 'inapp', next: boolean, dflt: { email: boolean; inapp: boolean }) => {
    const key = `${kind}:${channel}`
    setSavingKey(key)

    // Optimistic
    setPrefs((prev) => {
      const cur = prev[kind] ?? {
        kind,
        email_enabled: dflt.email,
        inapp_enabled: dflt.inapp,
        updated_at: new Date().toISOString(),
      }
      return {
        ...prev,
        [kind]: {
          ...cur,
          ...(channel === 'email' ? { email_enabled: next } : { inapp_enabled: next }),
        },
      }
    })

    const body: Record<string, unknown> = { kind }
    if (channel === 'email') body['email_enabled'] = next
    else body['inapp_enabled'] = next

    const res = await api.patch('/api/notifications/preferences', body)
    setSavingKey(null)
    if (!res.error) {
      setSavedKey(key)
      setTimeout(() => setSavedKey((s) => (s === key ? null : s)), 1500)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-lime-400" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Notificaciones"
        subtitle="Elige cómo y cuándo quieres que Celura te avise"
      />

      {/* Leyenda de columnas */}
      <Card className="mb-5 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-zinc-400">
            Activa o desactiva canales por tipo de evento. Los cambios se guardan al instante.
          </p>
          <div className="hidden sm:flex items-center gap-5">
            <ColumnLabel icon={Smartphone} label="In-app" />
            <ColumnLabel icon={Mail} label="Email" />
          </div>
        </div>
      </Card>

      <div className="space-y-5">
        {SECTIONS.map((sec) => (
          <Card key={sec.title} className="overflow-hidden p-0">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <h3 className="text-sm font-semibold text-white">{sec.title}</h3>
              <p className="mt-0.5 text-[12px] text-zinc-500">{sec.desc}</p>
            </div>
            <ul className="divide-y divide-white/[0.04]">
              {sec.items.map((it) => {
                const Icon = it.icon
                const inappOn = getValue(it.kind, 'inapp', it.defaultInapp)
                const emailOn = getValue(it.kind, 'email', it.defaultEmail)
                const dflt = { email: it.defaultEmail, inapp: it.defaultInapp }
                return (
                  <li key={it.kind} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]">
                      <Icon className="h-4 w-4 text-zinc-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-white">{it.label}</p>
                      <p className="truncate text-[11px] text-zinc-500">{it.desc}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                      <Toggle
                        on={inappOn}
                        loading={savingKey === `${it.kind}:inapp`}
                        saved={savedKey === `${it.kind}:inapp`}
                        onChange={(v) => void toggle(it.kind, 'inapp', v, dflt)}
                        label="In-app"
                        icon={Smartphone}
                      />
                      <Toggle
                        on={emailOn}
                        loading={savingKey === `${it.kind}:email`}
                        saved={savedKey === `${it.kind}:email`}
                        onChange={(v) => void toggle(it.kind, 'email', v, dflt)}
                        label="Email"
                        icon={Mail}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-center text-[11px] text-zinc-600">
        Los recordatorios críticos del sistema (sesión vencida, errores graves) siempre se envían.
      </p>
    </div>
  )
}

function ColumnLabel({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
      <Icon className="h-3 w-3" />
      {label}
    </div>
  )
}

function Toggle({
  on, loading, saved, onChange, label, icon: Icon,
}: {
  on: boolean
  loading: boolean
  saved: boolean
  onChange: (v: boolean) => void
  label: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={() => onChange(!on)}
        disabled={loading}
        aria-label={`${label}: ${on ? 'activado' : 'desactivado'}`}
        className={clsx(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          on ? 'bg-lime-500' : 'bg-white/[0.08]',
          loading && 'opacity-60',
        )}
      >
        <span
          className={clsx(
            'inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow transition-transform',
            on ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
          ) : saved ? (
            <CheckCircle2 className="h-3 w-3 text-lime-500" />
          ) : (
            <Icon className="h-2.5 w-2.5 text-zinc-500" />
          )}
        </span>
      </button>
      <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 sm:hidden">{label}</span>
    </div>
  )
}
