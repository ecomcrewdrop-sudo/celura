import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Plus, Ticket, Trash2, Pencil, X, Check, Copy, BadgePercent, CalendarClock, Crown, DollarSign, Sparkles } from 'lucide-react'
import clsx from 'clsx'

type Kind = 'discount_pct' | 'discount_amount' | 'trial_extend' | 'plan_upgrade'
type Plan = 'trial' | 'esencial' | 'pro' | 'clinica'

interface Promo {
  id: string
  code: string
  kind: Kind
  value: number
  currency: string | null
  target_plan: Plan | null
  applies_to_plans: Plan[] | null
  max_redemptions: number | null
  redemptions_count: number
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  affiliate_user_id: string | null
  affiliate_commission_pct: number | null
  notes: string | null
  created_at: string
}

interface ListRes {
  items: Promo[]
  total: number
}

interface FormState {
  id?: string
  code: string
  kind: Kind
  value: number
  currency: string
  target_plan: Plan | ''
  applies_to_plans: Plan[]
  max_redemptions: string
  starts_at: string
  ends_at: string
  is_active: boolean
  affiliate_user_id: string
  affiliate_commission_pct: string
  notes: string
}

const EMPTY: FormState = {
  code: '',
  kind: 'trial_extend',
  value: 7,
  currency: 'USD',
  target_plan: '',
  applies_to_plans: [],
  max_redemptions: '',
  starts_at: '',
  ends_at: '',
  is_active: true,
  affiliate_user_id: '',
  affiliate_commission_pct: '',
  notes: '',
}

export default function AdminPromos() {
  const [items, setItems] = useState<Promo[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('')
  const [q, setQ] = useState('')

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (activeFilter) params.set('active', activeFilter)
    const res = await api.get<ListRes>(`/admin/promo-codes?${params.toString()}`)
    if (res.data) setItems(res.data.items)
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, activeFilter])

  const showFlash = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 2400)
  }

  const save = async () => {
    if (!editing) return
    setBusy(true)
    const payload: Record<string, unknown> = {
      code: editing.code.trim().toUpperCase(),
      kind: editing.kind,
      value: Number(editing.value),
      currency: editing.currency || null,
      target_plan: editing.target_plan || null,
      applies_to_plans: editing.applies_to_plans.length > 0 ? editing.applies_to_plans : null,
      max_redemptions: editing.max_redemptions ? Number(editing.max_redemptions) : null,
      starts_at: editing.starts_at ? new Date(editing.starts_at).toISOString() : null,
      ends_at: editing.ends_at ? new Date(editing.ends_at).toISOString() : null,
      is_active: editing.is_active,
      affiliate_user_id: editing.affiliate_user_id.trim() || null,
      affiliate_commission_pct: editing.affiliate_commission_pct
        ? Number(editing.affiliate_commission_pct)
        : null,
      notes: editing.notes.trim() || null,
    }
    const res = editing.id
      ? await api.patch(`/admin/promo-codes/${editing.id}`, payload)
      : await api.post('/admin/promo-codes', payload)
    setBusy(false)
    if (res.error) {
      showFlash('Error: ' + res.error)
      return
    }
    showFlash(editing.id ? 'Código actualizado' : 'Código creado')
    setEditing(null)
    await load()
  }

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este código? Las redenciones asociadas también se borrarán.')) return
    await api.delete(`/admin/promo-codes/${id}`)
    showFlash('Código eliminado')
    await load()
  }

  const copy = (code: string) => {
    navigator.clipboard.writeText(code)
    showFlash(`Código "${code}" copiado`)
  }

  const startEdit = (p: Promo) => {
    setEditing({
      id: p.id,
      code: p.code,
      kind: p.kind,
      value: p.value,
      currency: p.currency ?? 'USD',
      target_plan: p.target_plan ?? '',
      applies_to_plans: p.applies_to_plans ?? [],
      max_redemptions: p.max_redemptions?.toString() ?? '',
      starts_at: p.starts_at ? toLocalInput(p.starts_at) : '',
      ends_at: p.ends_at ? toLocalInput(p.ends_at) : '',
      is_active: p.is_active,
      affiliate_user_id: p.affiliate_user_id ?? '',
      affiliate_commission_pct: p.affiliate_commission_pct?.toString() ?? '',
      notes: p.notes ?? '',
    })
  }

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let out = ''
    for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)]
    if (editing) setEditing({ ...editing, code: out })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">Códigos promo</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Cupones de descuento, extensión de trial, upgrade de plan y códigos de afiliados.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...EMPTY })}
          className="touch-target flex items-center justify-center gap-2 rounded-lg bg-violet-500/15 px-3 py-2 text-sm font-medium text-violet-300 hover:bg-violet-500/25"
        >
          <Plus className="h-4 w-4" /> Nuevo código
        </button>
      </div>

      {flash && (
        <div className="rounded-lg border border-lime-500/20 bg-lime-500/10 px-3 py-2 text-xs text-lime-300">
          {flash}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-dark-800 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar código…"
          className="h-9 min-w-[200px] flex-1 rounded-lg border border-white/[0.06] bg-dark-700 px-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-violet-400/30 focus:outline-none"
        />
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as 'true' | 'false' | '')}
          className="h-9 rounded-lg border border-white/[0.06] bg-dark-700 px-3 text-xs text-zinc-300 focus:border-violet-400/30 focus:outline-none"
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      {/* Editor */}
      {editing && (
        <div className="rounded-2xl border border-violet-400/20 bg-dark-800 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              {editing.id ? 'Editar código' : 'Nuevo código'}
            </h2>
            <button onClick={() => setEditing(null)} className="text-zinc-500 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Código">
              <div className="flex gap-2">
                <input
                  value={editing.code}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                  placeholder="LAUNCH50"
                  className="input flex-1 font-mono"
                />
                <button
                  type="button"
                  onClick={generateCode}
                  className="rounded-lg border border-white/[0.06] bg-dark-700 px-2 text-xs text-zinc-400 hover:bg-white/[0.04]"
                  title="Generar aleatorio"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </button>
              </div>
            </Field>
            <Field label="Tipo">
              <select
                value={editing.kind}
                onChange={(e) => setEditing({ ...editing, kind: e.target.value as Kind })}
                className="input"
              >
                <option value="trial_extend">Extender trial (días)</option>
                <option value="discount_pct">Descuento %</option>
                <option value="discount_amount">Descuento monto fijo</option>
                <option value="plan_upgrade">Upgrade de plan</option>
              </select>
            </Field>

            {editing.kind !== 'plan_upgrade' && (
              <Field
                label={
                  editing.kind === 'trial_extend'
                    ? 'Días a sumar'
                    : editing.kind === 'discount_pct'
                    ? 'Porcentaje (0-100)'
                    : 'Monto'
                }
              >
                <input
                  type="number"
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })}
                  className="input"
                />
              </Field>
            )}

            {editing.kind === 'plan_upgrade' && (
              <Field label="Upgrade al plan">
                <select
                  value={editing.target_plan}
                  onChange={(e) => setEditing({ ...editing, target_plan: e.target.value as Plan | '' })}
                  className="input"
                >
                  <option value="">— elegir —</option>
                  <option value="esencial">Esencial</option>
                  <option value="pro">Pro</option>
                  <option value="clinica">Clínica</option>
                </select>
              </Field>
            )}

            {editing.kind === 'discount_amount' && (
              <Field label="Moneda">
                <select
                  value={editing.currency}
                  onChange={(e) => setEditing({ ...editing, currency: e.target.value })}
                  className="input"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="MXN">MXN</option>
                  <option value="ARS">ARS</option>
                  <option value="COP">COP</option>
                </select>
              </Field>
            )}

            <Field label="Aplica a planes (vacío = cualquiera)" full>
              <div className="flex flex-wrap gap-2">
                {(['trial', 'esencial', 'pro', 'clinica'] as Plan[]).map((p) => (
                  <label
                    key={p}
                    className={clsx(
                      'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs',
                      editing.applies_to_plans.includes(p)
                        ? 'border-violet-400/40 bg-violet-500/15 text-violet-300'
                        : 'border-white/[0.06] bg-dark-700 text-zinc-400',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={editing.applies_to_plans.includes(p)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...editing.applies_to_plans, p]
                          : editing.applies_to_plans.filter((x) => x !== p)
                        setEditing({ ...editing, applies_to_plans: next })
                      }}
                    />
                    {p}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Máx. redenciones (vacío = ilimitado)">
              <input
                type="number"
                value={editing.max_redemptions}
                onChange={(e) => setEditing({ ...editing, max_redemptions: e.target.value })}
                placeholder="∞"
                className="input"
              />
            </Field>
            <Field label="Estado">
              <select
                value={editing.is_active ? '1' : '0'}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.value === '1' })}
                className="input"
              >
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
            </Field>
            <Field label="Válido desde">
              <input
                type="datetime-local"
                value={editing.starts_at}
                onChange={(e) => setEditing({ ...editing, starts_at: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Válido hasta">
              <input
                type="datetime-local"
                value={editing.ends_at}
                onChange={(e) => setEditing({ ...editing, ends_at: e.target.value })}
                className="input"
              />
            </Field>

            <Field label="Afiliado (UUID de auth.users, opcional)">
              <input
                value={editing.affiliate_user_id}
                onChange={(e) => setEditing({ ...editing, affiliate_user_id: e.target.value })}
                placeholder="00000000-0000-…"
                className="input font-mono text-[11px]"
              />
            </Field>
            <Field label="Comisión del afiliado (%)">
              <input
                type="number"
                value={editing.affiliate_commission_pct}
                onChange={(e) =>
                  setEditing({ ...editing, affiliate_commission_pct: e.target.value })
                }
                placeholder="20"
                className="input"
              />
            </Field>

            <Field label="Notas internas" full>
              <textarea
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                rows={2}
                placeholder="Campaña, contexto, etc. No se muestra al cliente."
                className="input min-h-[56px]"
              />
            </Field>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setEditing(null)}
              className="rounded-lg border border-white/[0.06] bg-dark-700 px-3 py-2 text-xs text-zinc-400 hover:bg-white/[0.04]"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={busy || !editing.code.trim()}
              className="flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-2 text-xs font-medium text-white hover:bg-violet-400 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {editing.id ? 'Guardar cambios' : 'Crear código'}
            </button>
          </div>
        </div>
      )}

      {/* Lista — mobile cards */}
      <div className="space-y-2 lg:hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
          ))
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-dark-800 p-12 text-center text-sm text-zinc-500">
            <Ticket className="mx-auto h-6 w-6 text-zinc-600" />
            <p className="mt-2">Ningún código creado todavía.</p>
          </div>
        ) : (
          items.map((p) => (
            <div key={p.id} className="rounded-xl border border-white/[0.06] bg-dark-800 p-4">
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => copy(p.code)}
                  className="flex items-center gap-1.5 rounded bg-white/[0.04] px-2 py-1 font-mono text-sm font-semibold text-violet-300 hover:bg-white/[0.08]"
                >
                  {p.code}
                  <Copy className="h-3 w-3 opacity-60" />
                </button>
                <StatusBadge active={p.is_active} expired={!!p.ends_at && new Date(p.ends_at) < new Date()} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <KindBadge kind={p.kind} value={p.value} currency={p.currency} target={p.target_plan} />
                {p.affiliate_user_id && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                    Afiliado · {p.affiliate_commission_pct ?? 0}%
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
                <span>
                  Uso <span className="text-zinc-300">{p.redemptions_count}</span>
                  <span className="text-zinc-600"> / {p.max_redemptions ?? '∞'}</span>
                </span>
                <span>
                  {p.ends_at
                    ? `hasta ${new Date(p.ends_at).toLocaleDateString('es')}`
                    : 'sin fin'}
                </span>
              </div>
              <div className="mt-3 flex gap-2 border-t border-white/[0.04] pt-3">
                <button
                  onClick={() => startEdit(p)}
                  className="touch-target flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-dark-700 px-2 py-2 text-xs text-zinc-300"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="touch-target flex items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Lista — desktop */}
      <div className="hidden overflow-hidden rounded-2xl border border-white/[0.06] bg-dark-800 lg:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/[0.06] bg-white/[0.02]">
            <tr className="text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Tipo / Valor</th>
              <th className="px-4 py-3 font-medium">Uso</th>
              <th className="px-4 py-3 font-medium">Vigencia</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-white/[0.04]">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-6 animate-pulse rounded bg-white/[0.03]" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-500">
                  <Ticket className="mx-auto h-6 w-6 text-zinc-600" />
                  <p className="mt-2">Ningún código creado todavía.</p>
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copy(p.code)}
                        className="flex items-center gap-1.5 rounded bg-white/[0.04] px-2 py-1 font-mono text-xs font-semibold text-violet-300 hover:bg-white/[0.08]"
                      >
                        {p.code}
                        <Copy className="h-3 w-3 opacity-60" />
                      </button>
                    </div>
                    {p.affiliate_user_id && (
                      <p className="mt-1 text-[10px] text-amber-400">
                        Afiliado · {p.affiliate_commission_pct ?? 0}%
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <KindBadge kind={p.kind} value={p.value} currency={p.currency} target={p.target_plan} />
                    {p.applies_to_plans && p.applies_to_plans.length > 0 && (
                      <p className="mt-1 text-[10px] text-zinc-500">
                        para: {p.applies_to_plans.join(', ')}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="text-zinc-300">{p.redemptions_count}</span>
                    <span className="text-zinc-600">
                      {' '}
                      / {p.max_redemptions ?? '∞'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-zinc-500">
                    {p.starts_at && <p>desde {new Date(p.starts_at).toLocaleDateString('es')}</p>}
                    {p.ends_at ? (
                      <p>hasta {new Date(p.ends_at).toLocaleDateString('es')}</p>
                    ) : (
                      <p>sin fecha de fin</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge active={p.is_active} expired={!!p.ends_at && new Date(p.ends_at) < new Date()} />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(p)}
                        className="rounded-lg border border-white/[0.06] bg-dark-700 p-1.5 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                        title="Editar"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => remove(p.id)}
                        className="rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .input {
          height: 36px;
          width: 100%;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.06);
          background: #1a1a1f;
          padding: 0 12px;
          font-size: 13px;
          color: rgb(228 228 231);
        }
        .input:focus { outline: none; border-color: rgba(167,139,250,0.3); }
        textarea.input { padding: 8px 12px; font-family: inherit; }
      `}</style>
    </div>
  )
}

function Field({
  label,
  children,
  full,
}: {
  label: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  )
}

function KindBadge({
  kind,
  value,
  currency,
  target,
}: {
  kind: Kind
  value: number
  currency: string | null
  target: string | null
}) {
  const map: Record<Kind, { icon: React.ReactNode; label: string; cls: string }> = {
    trial_extend: {
      icon: <CalendarClock className="h-3 w-3" />,
      label: `+${value}d trial`,
      cls: 'bg-amber-500/15 text-amber-300',
    },
    discount_pct: {
      icon: <BadgePercent className="h-3 w-3" />,
      label: `${value}% off`,
      cls: 'bg-violet-500/15 text-violet-300',
    },
    discount_amount: {
      icon: <DollarSign className="h-3 w-3" />,
      label: `${value} ${currency ?? ''} off`,
      cls: 'bg-violet-500/15 text-violet-300',
    },
    plan_upgrade: {
      icon: <Crown className="h-3 w-3" />,
      label: `→ ${target ?? '?'}`,
      cls: 'bg-lime-500/15 text-lime-300',
    },
  }
  const m = map[kind]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        m.cls,
      )}
    >
      {m.icon}
      {m.label}
    </span>
  )
}

function StatusBadge({ active, expired }: { active: boolean; expired: boolean }) {
  if (expired) {
    return (
      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-300">
        Vencido
      </span>
    )
  }
  return (
    <span
      className={clsx(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        active ? 'bg-lime-500/15 text-lime-300' : 'bg-zinc-500/15 text-zinc-400',
      )}
    >
      {active ? 'Activo' : 'Inactivo'}
    </span>
  )
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}
