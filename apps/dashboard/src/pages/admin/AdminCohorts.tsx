import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { LineChart, Users } from 'lucide-react'
import clsx from 'clsx'

interface RetentionPoint {
  offset: number
  active: number
  pct: number
}

interface Cohort {
  cohort_month: string
  size: number
  active_now: number
  paid_now: number
  retention: RetentionPoint[]
}

interface CohortRes {
  cohorts: Cohort[]
  max_offset: number
}

export default function AdminCohorts() {
  const [data, setData] = useState<CohortRes | null>(null)
  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState(12)

  useEffect(() => {
    setLoading(true)
    api.get<CohortRes>(`/admin/cohorts?months=${months}`).then((r) => {
      setData(r.data)
      setLoading(false)
    })
  }, [months])

  // Stats globales calculadas en el cliente
  const totalSignups = data?.cohorts.reduce((sum, c) => sum + c.size, 0) ?? 0
  const totalActive = data?.cohorts.reduce((sum, c) => sum + c.active_now, 0) ?? 0
  const totalPaid = data?.cohorts.reduce((sum, c) => sum + c.paid_now, 0) ?? 0
  const overallRetention = totalSignups > 0 ? Math.round((totalActive / totalSignups) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Cohortes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Retención por mes de signup. % de clínicas que tuvieron actividad (al menos 1 lead) en cada
            mes posterior.
          </p>
        </div>
        <select
          value={months}
          onChange={(e) => setMonths(parseInt(e.target.value, 10))}
          className="h-9 rounded-lg border border-white/[0.06] bg-dark-700 px-3 text-xs text-zinc-300 focus:border-violet-400/30 focus:outline-none"
        >
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={18}>Últimos 18 meses</option>
          <option value={24}>Últimos 24 meses</option>
        </select>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Signups" value={totalSignups} sub="en el rango" color="violet" />
        <Kpi label="Activas hoy" value={totalActive} sub={`${overallRetention}% retención global`} color="lime" />
        <Kpi label="De pago" value={totalPaid} sub="excluyendo trial" color="sky" />
        <Kpi
          label="Cohortes"
          value={data?.cohorts.length ?? 0}
          sub="meses analizados"
          color="amber"
        />
      </div>

      {/* Triángulo de retención */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-dark-800">
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-white">Matriz de retención</h2>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Filas = cohorte (mes de signup) · Columnas = meses transcurridos desde signup. El número es % activas.
          </p>
        </div>

        {loading ? (
          <div className="p-8">
            <div className="h-40 animate-pulse rounded bg-white/[0.03]" />
          </div>
        ) : !data || data.cohorts.length === 0 ? (
          <div className="p-12 text-center text-sm text-zinc-500">
            <Users className="mx-auto h-6 w-6 text-zinc-600" />
            <p className="mt-2">Sin signups en el rango seleccionado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-white/[0.02]">
                <tr className="text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="sticky left-0 bg-dark-800 px-3 py-2 text-left font-medium">Cohorte</th>
                  <th className="px-3 py-2 text-right font-medium">Tamaño</th>
                  {Array.from({ length: data.max_offset + 1 }).map((_, i) => (
                    <th key={i} className="min-w-[52px] px-2 py-2 text-center font-medium">
                      M{i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((c) => (
                  <tr key={c.cohort_month} className="border-t border-white/[0.04]">
                    <td className="sticky left-0 bg-dark-800 px-3 py-2 text-zinc-300">
                      {formatMonth(c.cohort_month)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-400">{c.size}</td>
                    {Array.from({ length: data.max_offset + 1 }).map((_, i) => {
                      const p = c.retention[i]
                      if (!p) {
                        return <td key={i} className="px-2 py-2 text-center text-zinc-700">·</td>
                      }
                      return (
                        <td key={i} className="px-2 py-2 text-center">
                          <RetentionCell pct={p.pct} count={p.active} cohortSize={c.size} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="rounded-xl border border-white/[0.06] bg-dark-800 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Leyenda</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <LegendCell pct={100} />
          <LegendCell pct={75} />
          <LegendCell pct={50} />
          <LegendCell pct={25} />
          <LegendCell pct={5} />
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">
          <strong className="text-zinc-300">M0</strong> es el mes del signup. <strong className="text-zinc-300">M1</strong>{' '}
          es el siguiente. Una clínica cuenta como "activa" en un mes si creó al menos 1 lead en ese mes.
        </p>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: number
  sub: string
  color: 'violet' | 'lime' | 'sky' | 'amber'
}) {
  const map = {
    violet: 'bg-violet-500/10 text-violet-400',
    lime: 'bg-lime-500/10 text-lime-400',
    sky: 'bg-sky-500/10 text-sky-400',
    amber: 'bg-amber-500/10 text-amber-400',
  }
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-dark-800 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={clsx('mt-2 text-2xl font-semibold', map[color].split(' ')[1])}>{value.toLocaleString()}</p>
      <p className="mt-1 text-[11px] text-zinc-500">{sub}</p>
    </div>
  )
}

function RetentionCell({ pct, count, cohortSize }: { pct: number; count: number; cohortSize: number }) {
  // Color escalado de violeta según %
  const intensity = Math.min(pct / 100, 1)
  // Use static class names so Tailwind doesn't purge them
  const bgClass =
    pct >= 80
      ? 'bg-violet-500/60'
      : pct >= 60
      ? 'bg-violet-500/45'
      : pct >= 40
      ? 'bg-violet-500/30'
      : pct >= 20
      ? 'bg-violet-500/18'
      : pct > 0
      ? 'bg-violet-500/8'
      : 'bg-white/[0.03]'
  const textClass = intensity > 0.5 ? 'text-white' : 'text-zinc-300'
  return (
    <div
      title={`${count} de ${cohortSize} clínicas activas`}
      className={clsx(
        'mx-auto flex h-9 w-12 items-center justify-center rounded font-mono text-[11px] font-semibold',
        bgClass,
        textClass,
      )}
    >
      {pct >= 1 ? `${pct.toFixed(0)}%` : '—'}
    </div>
  )
}

function LegendCell({ pct }: { pct: number }) {
  const bg =
    pct >= 80
      ? 'bg-violet-500/60'
      : pct >= 60
      ? 'bg-violet-500/45'
      : pct >= 40
      ? 'bg-violet-500/30'
      : pct >= 20
      ? 'bg-violet-500/18'
      : 'bg-violet-500/8'
  return (
    <div className="flex items-center gap-1.5">
      <span className={clsx('inline-block h-4 w-6 rounded', bg)} />
      <span className="text-zinc-400">{pct}%</span>
    </div>
  )
}

function formatMonth(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es', { month: 'short', year: 'numeric' })
}
