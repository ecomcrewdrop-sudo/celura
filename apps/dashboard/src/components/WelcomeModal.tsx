// ============================================================
//  CELURA · Welcome modal de bienvenida (primer login)
//  ------------------------------------------------------------
//  Aparece UNA vez por usuario (localStorage por user.id).
//  Da la bienvenida, explica QUÉ pasa ahora, y empuja al
//  paso 1 (Configurar guiado) o a "explorar libre".
//
//  No interrumpe — el doctor puede cerrarlo en cualquier momento.
// ============================================================

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, ArrowRight, Smartphone, Bot, BarChart3,
  X, Stars,
} from 'lucide-react'
import clsx from 'clsx'
import { useClinic } from '@/hooks/useClinic'
import { useAuth } from '@/hooks/useAuth'
import { useSetupSteps } from '@/hooks/useSetupSteps'

const STORAGE_PREFIX = 'celura:welcome-seen:'

export default function WelcomeModal() {
  const { user } = useAuth()
  const { clinic, loading: clinicLoading } = useClinic()
  const { isComplete, loading: setupLoading } = useSetupSteps()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)

  // Decidir si mostrar (solo una vez por usuario)
  useEffect(() => {
    if (!user?.id || clinicLoading || setupLoading || !clinic) return
    // Si ya tiene todo configurado, no molestar
    if (isComplete) return
    try {
      const key = STORAGE_PREFIX + user.id
      if (localStorage.getItem(key)) return
    } catch { /* ignore */ }
    // Delay corto para que la página termine de pintar primero
    const t = setTimeout(() => setOpen(true), 500)
    return () => clearTimeout(t)
  }, [user?.id, clinic, clinicLoading, setupLoading, isComplete])

  const markSeen = () => {
    if (!user?.id) return
    try {
      localStorage.setItem(STORAGE_PREFIX + user.id, '1')
    } catch { /* ignore */ }
  }

  const handleClose = () => {
    markSeen()
    setClosing(true)
    setTimeout(() => { setOpen(false); setClosing(false) }, 200)
  }

  const handleStartGuide = () => {
    markSeen()
    setOpen(false)
    navigate('/setup')
  }

  if (!open) return null
  if (typeof document === 'undefined') return null

  const firstName = clinic?.name?.split(' ')[0] ?? ''

  return createPortal(
    <div
      className={clsx(
        'fixed inset-0 z-[110] flex items-center justify-center p-4',
        closing ? 'animate-fade-out' : 'animate-fade-in',
      )}
    >
      {/* Backdrop */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          'relative w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.08] bg-dark-800 shadow-2xl',
          closing ? 'animate-scale-out' : 'animate-scale-up',
        )}
      >
        {/* Close */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Hero header con glow */}
        <div className="relative overflow-hidden px-6 pb-2 pt-7 sm:px-8 sm:pt-9">
          <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-lime-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-lime-400/[0.08] blur-3xl" />

          <div className="relative">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-lime-400/25 bg-lime-400/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-lime-300">
              <Sparkles className="h-3 w-3" />
              Bienvenida
            </div>
            <h2 className="text-[24px] font-bold leading-tight text-white sm:text-[26px]">
              Hola{firstName ? `, ${firstName}` : ''}.{' '}
              <span className="bg-gradient-to-r from-lime-300 to-lime-500 bg-clip-text text-transparent">
                Esto va a ser fácil.
              </span>
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
              Celura es tu asistente para WhatsApp. Antes de empezar a atender pacientes, vamos a ajustarlo a tu clínica en pasos cortos.
            </p>
          </div>
        </div>

        {/* Highlights */}
        <div className="px-6 py-5 sm:px-8">
          <ul className="space-y-3">
            <Highlight
              icon={Smartphone}
              title="Conectas tu WhatsApp"
              desc="En 2 minutos. Sin instalar nada, sin perder tu número."
            />
            <Highlight
              icon={Bot}
              title="Le das tu voz y tus reglas"
              desc="Saludo, horarios, tratamientos, cuándo te avisa a ti."
            />
            <Highlight
              icon={BarChart3}
              title="Tú miras desde el panel"
              desc="Conversaciones, citas, métricas. Tu equipo también."
            />
          </ul>
        </div>

        {/* Footer / CTAs */}
        <div className="border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:px-8">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleStartGuide}
              className="group inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 py-3 text-[14px] font-semibold text-dark-900 transition-all hover:bg-lime-300"
            >
              <Stars className="h-4 w-4" />
              Empezar la guía
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-[13px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
            >
              Explorar por mi cuenta
            </button>
          </div>
          <p className="mt-3 text-center text-[10px] text-zinc-600">
            Puedes volver a esta guía cuando quieras desde el menú lateral.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Highlight({
  icon: Icon, title, desc,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
}) {
  return (
    <li className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime-400/[0.08] ring-1 ring-lime-400/20">
        <Icon className="h-4 w-4 text-lime-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-white">{title}</p>
        <p className="text-[12px] leading-snug text-zinc-500">{desc}</p>
      </div>
    </li>
  )
}
