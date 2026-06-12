// ============================================================
//  CELURA · Página de guía de configuración (/setup)
//  ------------------------------------------------------------
//  Hub central: hero con anillo de progreso, próximo paso
//  sugerido grande, lista de pasos requeridos + opcionales.
//
//  Diseño: empieza grande, calmado, claro — cada paso se siente
//  como una decisión consciente, no como un formulario.
// ============================================================

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Circle, ArrowRight, Sparkles,
  PartyPopper, Timer, ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import clsx from 'clsx'
import { useSetupSteps, type SetupStep } from '@/hooks/useSetupSteps'
import { useClinic } from '@/hooks/useClinic'
import Card from '@/components/Card'

export default function Setup() {
  const navigate = useNavigate()
  const { clinic } = useClinic()
  const {
    loading, required, optional, nextStep,
    progressPct, isComplete, pendingRequiredCount,
    minsLeft, requiredDone, requiredTotal,
  } = useSetupSteps()

  const firstName = useMemo(() => {
    const n = clinic?.name?.split(' ')[0] ?? ''
    return n ? `, ${n}` : ''
  }, [clinic?.name])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-lime-400" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* ── HERO ───────────────────────────────────────────── */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-lime-500/[0.06] via-dark-800 to-dark-800 px-5 py-6 sm:px-8 sm:py-8">
        {/* Glow decorativo */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-lime-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-lime-400/[0.04] blur-3xl" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          <ProgressRing pct={progressPct} complete={isComplete} />

          <div className="min-w-0 flex-1">
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-lime-400/20 bg-lime-400/[0.06] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-lime-300">
              <Sparkles className="h-3 w-3" />
              Configuración guiada
            </div>
            <h1 className="text-[22px] font-bold leading-tight text-white sm:text-[26px]">
              {isComplete
                ? `Todo listo${firstName}`
                : `Vamos a dejar tu asistente perfecto${firstName}`}
            </h1>
            <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-zinc-400">
              {isComplete
                ? 'Has configurado todo lo importante. Tu asistente está listo para atender pacientes con tu voz y tus reglas.'
                : 'Hacemos esto en pasos cortos para que el asistente trabaje como tú quieres — no como una IA genérica.'}
            </p>

            {!isComplete && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-lime-400" />
                  <span className="text-zinc-300">{requiredDone}</span>
                  <span>de {requiredTotal} listo</span>
                </span>
                <span className="text-zinc-700">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5 text-zinc-500" />
                  <span>{minsLeft} min restantes</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* CTA grande del próximo paso */}
        {!isComplete && nextStep && (
          <div className="relative mt-5">
            <NextStepCard step={nextStep} onGo={() => navigateToStep(navigate, nextStep)} />
          </div>
        )}

        {isComplete && (
          <div className="relative mt-5 flex items-center gap-3 rounded-2xl border border-lime-400/20 bg-lime-400/[0.05] px-4 py-3">
            <PartyPopper className="h-5 w-5 shrink-0 text-lime-400" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white">
                Cualquier cambio futuro lo haces desde Configuración.
              </p>
              <p className="text-[12px] text-zinc-400">
                Puedes volver a esta guía cuando quieras, todo queda visible.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── LISTA REQUERIDOS ───────────────────────────────── */}
      <section className="mb-6">
        <h2 className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <span>Pasos esenciales</span>
          {pendingRequiredCount > 0 && (
            <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300">
              {pendingRequiredCount} por hacer
            </span>
          )}
        </h2>
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-white/[0.04]">
            {required.map((s, i) => (
              <StepRow
                key={s.id}
                step={s}
                index={i}
                onGo={() => navigateToStep(navigate, s)}
                isNext={!isComplete && nextStep?.id === s.id}
              />
            ))}
          </ul>
        </Card>
      </section>

      {/* ── LISTA OPCIONALES ───────────────────────────────── */}
      {optional.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <span>Opcionales para sacarle todo el jugo</span>
          </h2>
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-white/[0.04]">
              {optional.map((s, i) => (
                <StepRow
                  key={s.id}
                  step={s}
                  index={required.length + i}
                  onGo={() => navigateToStep(navigate, s)}
                />
              ))}
            </ul>
          </Card>
        </section>
      )}

      <p className="mb-8 text-center text-[11px] text-zinc-600">
        Todo lo de aquí también está en{' '}
        <button
          onClick={() => navigate('/settings')}
          className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
        >
          Configuración
        </button>
        . Esta guía solo te muestra qué falta.
      </p>
    </div>
  )
}

// ── Helpers de navegación con sección ──
function navigateToStep(navigate: ReturnType<typeof useNavigate>, step: SetupStep) {
  const url = step.action.section
    ? `${step.action.to}?section=${step.action.section}`
    : step.action.to
  navigate(url)
}

// ── Progress ring ─────────────────────────────────────────
function ProgressRing({ pct, complete }: { pct: number; complete: boolean }) {
  const size = 92
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c

  return (
    <div className="relative flex h-[92px] w-[92px] shrink-0 items-center justify-center">
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
          stroke={complete ? '#5DCAA5' : '#5DCAA5'}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {complete ? (
          <CheckCircle2 className="h-7 w-7 text-lime-400" />
        ) : (
          <>
            <span className="text-[22px] font-bold leading-none text-white">{pct}%</span>
            <span className="mt-0.5 text-[9px] uppercase tracking-wider text-zinc-500">listo</span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Next step (CTA grande) ────────────────────────────────
function NextStepCard({ step, onGo }: { step: SetupStep; onGo: () => void }) {
  const Icon = step.icon
  return (
    <button
      onClick={onGo}
      className="group flex w-full items-center gap-3 rounded-2xl border border-lime-400/25 bg-lime-400/[0.05] px-4 py-3 text-left transition-all hover:border-lime-400/40 hover:bg-lime-400/[0.08]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime-400/10 ring-1 ring-lime-400/20">
        <Icon className="h-5 w-5 text-lime-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-lime-300">
          Lo que sigue
        </p>
        <p className="truncate text-[14px] font-semibold text-white">{step.title}</p>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-400">{step.why}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-lime-300">
        <span className="hidden text-[12px] font-medium sm:inline">{step.action.label}</span>
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  )
}

// ── Step row ─────────────────────────────────────────────
function StepRow({
  step, index, onGo, isNext = false,
}: {
  step: SetupStep
  index: number
  onGo: () => void
  isNext?: boolean
}) {
  const Icon = step.icon
  const [expanded, setExpanded] = useState(false)

  return (
    <li
      className={clsx(
        'transition-colors',
        isNext && 'bg-lime-400/[0.03]',
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
        {/* Status */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center">
          {step.done ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-400/10 ring-1 ring-lime-400/25">
              <CheckCircle2 className="h-4 w-4 text-lime-400" />
            </div>
          ) : (
            <div className={clsx(
              'flex h-9 w-9 items-center justify-center rounded-xl ring-1',
              isNext
                ? 'bg-lime-400/[0.06] ring-lime-400/30'
                : 'bg-white/[0.04] ring-white/[0.08]',
            )}>
              <Icon className={clsx('h-4 w-4', isNext ? 'text-lime-300' : 'text-zinc-400')} />
            </div>
          )}
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-600">
              {String(index + 1).padStart(2, '0')}
            </span>
            <p
              className={clsx(
                'truncate text-[13px] font-semibold',
                step.done ? 'text-zinc-400' : 'text-white',
              )}
            >
              {step.title}
            </p>
            {isNext && (
              <span className="hidden rounded-full bg-lime-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-lime-300 sm:inline">
                Sigue
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">
            {step.desc}
          </p>
        </div>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 sm:flex"
            aria-label={expanded ? 'Ocultar' : 'Saber más'}
            title={expanded ? 'Ocultar' : 'Saber más'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {!step.done && (
            <button
              type="button"
              onClick={onGo}
              className={clsx(
                'inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium transition-colors',
                isNext
                  ? 'bg-lime-400 text-dark-900 hover:bg-lime-300'
                  : 'border border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:text-white',
              )}
            >
              {step.action.label}
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
          {step.done && (
            <button
              type="button"
              onClick={onGo}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
              title="Revisar / editar"
            >
              Editar
            </button>
          )}
        </div>
      </div>

      {/* Expand */}
      {expanded && (
        <div className="px-4 pb-4 pl-[68px] sm:px-5 sm:pl-[68px]">
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-3">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <div className="min-w-0">
                <p className="text-[12px] leading-relaxed text-zinc-300">
                  {step.why}
                </p>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-500">
                  <span className="inline-flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    ~{step.estMins} min
                  </span>
                  {step.optional && (
                    <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500">
                      Opcional
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

// Iconos exportados implícitamente (los importa Sidebar)
export { Circle }
