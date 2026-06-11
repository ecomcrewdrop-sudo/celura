import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Plus, Megaphone, Trash2, Pencil, X, Check } from 'lucide-react'
import clsx from 'clsx'

type Severity = 'info' | 'warning' | 'success' | 'promo' | 'maintenance'
type Audience = 'all' | 'trial' | 'paid' | 'beta' | 'specific'

interface Announcement {
  id: string
  title: string
  body: string
  severity: Severity
  audience: Audience
  audience_ids: string[] | null
  cta_label: string | null
  cta_url: string | null
  starts_at: string | null
  ends_at: string | null
  dismissible: boolean
  is_active: boolean
  created_at: string
}

interface FormState {
  id?: string
  title: string
  body: string
  severity: Severity
  audience: Audience
  cta_label: string
  cta_url: string
  starts_at: string
  ends_at: string
  dismissible: boolean
  is_active: boolean
}

const EMPTY: FormState = {
  title: '',
  body: '',
  severity: 'info',
  audience: 'all',
  cta_label: '',
  cta_url: '',
  starts_at: '',
  ends_at: '',
  dismissible: true,
  is_active: true,
}

export default function AdminAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await api.get<Announcement[]>('/admin/announcements')
    if (res.data) setItems(res.data)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const showFlash = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 2400)
  }

  const save = async () => {
    if (!editing) return
    setBusy(true)
    const payload: Record<string, unknown> = {
      title: editing.title.trim(),
      body: editing.body.trim(),
      severity: editing.severity,
      audience: editing.audience,
      cta_label: editing.cta_label.trim() || null,
      cta_url: editing.cta_url.trim() || null,
      starts_at: editing.starts_at ? new Date(editing.starts_at).toISOString() : null,
      ends_at: editing.ends_at ? new Date(editing.ends_at).toISOString() : null,
      dismissible: editing.dismissible,
      is_active: editing.is_active,
    }
    if (editing.id) {
      await api.patch(`/admin/announcements/${editing.id}`, payload)
      showFlash('Anuncio actualizado')
    } else {
      await api.post('/admin/announcements', payload)
      showFlash('Anuncio creado')
    }
    setBusy(false)
    setEditing(null)
    await load()
  }

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este anuncio? No se puede deshacer.')) return
    setBusy(true)
    await api.delete(`/admin/announcements/${id}`)
    setBusy(false)
    showFlash('Anuncio eliminado')
    await load()
  }

  const startEdit = (a: Announcement) => {
    setEditing({
      id: a.id,
      title: a.title,
      body: a.body,
      severity: a.severity,
      audience: a.audience,
      cta_label: a.cta_label ?? '',
      cta_url: a.cta_url ?? '',
      starts_at: a.starts_at ? toLocalInput(a.starts_at) : '',
      ends_at: a.ends_at ? toLocalInput(a.ends_at) : '',
      dismissible: a.dismissible,
      is_active: a.is_active,
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Anuncios</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Mensajes globales visibles para doctores. Filtra por audiencia y vigencia.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...EMPTY })}
          className="flex items-center gap-2 rounded-lg bg-violet-500/15 px-3 py-2 text-sm font-medium text-violet-300 hover:bg-violet-500/25"
        >
          <Plus className="h-4 w-4" /> Nuevo anuncio
        </button>
      </div>

      {flash && (
        <div className="rounded-lg border border-lime-500/20 bg-lime-500/10 px-3 py-2 text-xs text-lime-300">
          {flash}
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div className="rounded-2xl border border-violet-400/20 bg-dark-800 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              {editing.id ? 'Editar anuncio' : 'Nuevo anuncio'}
            </h2>
            <button
              onClick={() => setEditing(null)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Título">
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Severidad">
              <select
                value={editing.severity}
                onChange={(e) =>
                  setEditing({ ...editing, severity: e.target.value as Severity })
                }
                className="input"
              >
                <option value="info">Info</option>
                <option value="success">Éxito</option>
                <option value="warning">Aviso</option>
                <option value="promo">Promoción</option>
                <option value="maintenance">Mantenimiento</option>
              </select>
            </Field>
            <Field label="Cuerpo" full>
              <textarea
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                rows={3}
                className="input min-h-[72px]"
              />
            </Field>
            <Field label="Audiencia">
              <select
                value={editing.audience}
                onChange={(e) =>
                  setEditing({ ...editing, audience: e.target.value as Audience })
                }
                className="input"
              >
                <option value="all">Todos</option>
                <option value="trial">En trial</option>
                <option value="paid">Pagas</option>
                <option value="beta">Beta</option>
                <option value="specific">Específicas</option>
              </select>
            </Field>
            <Field label="CTA (texto)">
              <input
                value={editing.cta_label}
                onChange={(e) => setEditing({ ...editing, cta_label: e.target.value })}
                className="input"
                placeholder="Ver más"
              />
            </Field>
            <Field label="CTA (URL)">
              <input
                value={editing.cta_url}
                onChange={(e) => setEditing({ ...editing, cta_url: e.target.value })}
                className="input"
                placeholder="https://…"
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
            <Field label="Inicio">
              <input
                type="datetime-local"
                value={editing.starts_at}
                onChange={(e) => setEditing({ ...editing, starts_at: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Fin">
              <input
                type="datetime-local"
                value={editing.ends_at}
                onChange={(e) => setEditing({ ...editing, ends_at: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Descartable">
              <select
                value={editing.dismissible ? '1' : '0'}
                onChange={(e) =>
                  setEditing({ ...editing, dismissible: e.target.value === '1' })
                }
                className="input"
              >
                <option value="1">Sí</option>
                <option value="0">No (banner fijo)</option>
              </select>
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
              disabled={busy || !editing.title.trim() || !editing.body.trim()}
              className="flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-2 text-xs font-medium text-white hover:bg-violet-400 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {editing.id ? 'Guardar cambios' : 'Crear anuncio'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />
          ))
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-dark-800 p-10 text-center text-sm text-zinc-500">
            <Megaphone className="mx-auto h-6 w-6 text-zinc-600" />
            <p className="mt-2">Ningún anuncio creado todavía.</p>
          </div>
        ) : (
          items.map((a) => (
            <div
              key={a.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-dark-800 p-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={a.severity} />
                  <AudienceBadge audience={a.audience} />
                  {!a.is_active && (
                    <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Inactivo
                    </span>
                  )}
                  {a.ends_at && new Date(a.ends_at) < new Date() && (
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-300">
                      Vencido
                    </span>
                  )}
                </div>
                <h3 className="mt-2 text-sm font-semibold text-white">{a.title}</h3>
                <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{a.body}</p>
                <p className="mt-2 text-[11px] text-zinc-500">
                  {a.starts_at && <>desde {new Date(a.starts_at).toLocaleString('es')} · </>}
                  {a.ends_at ? `hasta ${new Date(a.ends_at).toLocaleString('es')}` : 'sin fecha de fin'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => startEdit(a)}
                  className="rounded-lg border border-white/[0.06] bg-dark-700 p-2 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => remove(a.id)}
                  className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
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
    <div className={full ? 'lg:col-span-2' : ''}>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    info: 'bg-sky-500/15 text-sky-300',
    success: 'bg-lime-500/15 text-lime-300',
    warning: 'bg-amber-500/15 text-amber-300',
    promo: 'bg-violet-500/15 text-violet-300',
    maintenance: 'bg-red-500/15 text-red-300',
  }
  return (
    <span
      className={clsx(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        styles[severity],
      )}
    >
      {severity}
    </span>
  )
}

function AudienceBadge({ audience }: { audience: Audience }) {
  return (
    <span className="rounded border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
      {audience}
    </span>
  )
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}
