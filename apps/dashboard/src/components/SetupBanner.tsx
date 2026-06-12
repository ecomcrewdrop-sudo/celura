// ============================================================
//  CELURA · Banner inteligente en el Dashboard
//  ------------------------------------------------------------
//  Solo aparece si NO está todo configurado. Muestra:
//   • progreso compacto (anillo o barra)
//   • próximo paso recomendado
//   • CTA a /setup
//
//  Se puede minimizar (localStorage) por 24h sin perderse.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles, X, ChevronRight, Timer } from 'lucide-react'
import clsx from 'clsx'
import { useSetupSteps } from '@/hooks/useSetupSteps'

const DISMISS_KEY = 'celura:setup-banner-dismissed-until'
const DISMISS_HOURS = 24

export default function SetupBanner() {
  const navigate = useNavigate()
  const { isComplete, progressPct, nextStep, minsLeft, pendingRequiredCount, loading } = useSetupSteps()
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null)

  // Cargar dismiss desde localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY)
      if (raw) setDismissedUntil(parseInt(raw, 10) || null)
    } catch { /* ignore */ }
  }, [])

  const isDismissedNow = useMemo(() => {
    if (!dismissedUntil) return false
    return Date.now() < dismissedUntil
  }, [dismissedUntil])

  if (loading || isComplete || isDismissedNow || !nextStep) return null

  const handleDismiss = () => {
    const until = Date.now() + DISMISS_HOURS * 3600_000
    try { localStorage.setItem(DISMISS_KEY, String(until)) } catch { /* ignore */ }
    setDismissedUntil(until)
  }

  const Icon = nextStep.icon
  const isUrgent = nextStep.priority === 'P0'

  return (
    <div
      className={clsx(
        'relative mb-5 overflow-hidden rounded-2xl border bg-gradient-to-br shadow-lg transition-all',
        isUrgent
          ? 'border-amber-400/25 from-amber-400/[0.06] via-dark-800 to-dark-800 shadow-amber-400/[0.05]'
          : 'border-lime-400/25 from-lime-400/[0.06] via-dark-800 to-dark-800 shadow-lime-400/[0.04]',
      )}
    >
      {/* Glow */}
      <div
        className={clsx(
          'pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl',
          isUrgent ? 'bg-amber-400/10' : 'bg-lime-400/10',
        )}
      />

      {/* Dismiss */}
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
        aria-label="Ocultar por 24h"
        title="Ocultar por 24h"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => navigate('/setup')}
        className="group relative flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5"
      >
        {/* Progress chip */}
        <ProgressChip pct={progressPct} urgent={isUrgent} />

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className={clsx('h-3 w-3', isUrgent ? 'text-amber-300' : 'text-lime-300')} />
            <span className={clsx(
              'text-[10px] font-semibold uppercase tracking-wider',
              isUrgent ? 'text-amber-300' : 'text-lime-300',
            )}>
              {isUrgent ? 'Necesitas configurar esto' : 'Termina de configurar tu asistente'}
            </span>
          </div>
          <p className="mt-1 truncate text-[15px] font-semibold leading-snug text-white">
            {nextStep.title}
          </p>
          <div className="mt-1 flex items-center gap-2.5 text-[11px] text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <Icon className="h-3 w-3" />
              {nextStep.action.label}
            </span>
            <span className="text-zinc-700">·</span>
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3 w-3" />
              ~{nextStep.estMins} min
            </span>
            <span className="text-zinc-700">·</span>
            <span>{pendingRequiredCount} pendientes ({minsLeft} min total)</span>
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight className="hidden h-5 w-5 shrink-0 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300 sm:block" />
      </button>

      {/* CTA secundario */}
      <div className="relative flex items-stretch gap-px border-t border-white/[0.04]">
        <button
          type="button"
          onClick={() => navigate('/setup')}
          className={clsx(
            'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition-colors',
            isUrgent
              ? 'bg-amber-400/[0.04] text-amber-200 hover:bg-amber-400/[0.08]'
              : 'bg-lime-400/[0.04] text-lime-200 hover:bg-lime-400/[0.08]',
          )}
        >
          Ver guía completa
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function ProgressChip({ pct, urgent }: { pct: number; urgent: boolean }) {
  const size = 56
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  return (
    <div className="relative flex h-[56px] w-[56px] shrink-0 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={urgent ? '#FBBF24' : '#5DCAA5'}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 600ms ease-out' }}
        />
      </svg>
      <span className="absolute text-[13px] font-bold text-white">{pct}%</span>
    </div>
  )
}
