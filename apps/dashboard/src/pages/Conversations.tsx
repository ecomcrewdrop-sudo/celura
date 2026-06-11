import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useClinic } from '@/hooks/useClinic'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import {
  MessageSquare,
  User,
  Bot,
  Wifi,
  WifiOff,
  AlertCircle,
  RefreshCw,
  Search,
  Send,
  AlertTriangle,
  Image as ImageIcon,
  Sparkles,
  Phone,
  Tag,
  Loader2,
  CheckCheck,
  Filter,
} from 'lucide-react'

type Stage = 'new' | 'contacted' | 'warm' | 'interested' | 'scheduled' | 'attended' | 'recurring' | 'lost'
type Urgency = 'low' | 'medium' | 'high' | 'emergency'

interface LeadSummary {
  id: string
  name: string | null
  phone: string
  stage: Stage
  score: number
  urgency_level?: Urgency
  treatment_interest?: string | null
  last_message_at?: string | null
}

interface LastMessageLite {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  type: string
}

interface ConvoSummary {
  id: string
  lead_id: string
  total_tokens: number
  updated_at: string
  leads: LeadSummary
  last_message: LastMessageLite | null
  message_count: number
  escalated: boolean
  last_intent: string | null
  has_vision: boolean
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  type: string
  source?: 'history' | 'outgoing'
  manual?: boolean
  analyzed?: boolean
}

interface LeadDetail extends LeadSummary {
  notes?: string | null
  first_contact_at?: string
  source?: string
}

interface ConvoDetail {
  lead: LeadDetail
  conversation: {
    id: string | null
    messages: Message[]
    context: Record<string, unknown>
    total_tokens: number
    updated_at?: string | null
  }
}

const POLL_INTERVAL_MS = 12_000

const STAGES: { value: Stage | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'new', label: 'Nuevas' },
  { value: 'contacted', label: 'Contactadas' },
  { value: 'warm', label: 'Tibias' },
  { value: 'interested', label: 'Interesadas' },
  { value: 'scheduled', label: 'Agendadas' },
  { value: 'attended', label: 'Atendidas' },
  { value: 'recurring', label: 'Recurrentes' },
  { value: 'lost', label: 'Perdidas' },
]

const URGENCY_COLOR: Record<Urgency, string> = {
  low: 'bg-zinc-700/40 text-zinc-300',
  medium: 'bg-blue-500/15 text-blue-300',
  high: 'bg-amber-500/15 text-amber-300',
  emergency: 'bg-red-500/15 text-red-300',
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24 && d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function Conversations() {
  const { clinic, config } = useClinic()
  const [convos, setConvos] = useState<ConvoSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConvoDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [liveConnected, setLiveConnected] = useState(false)
  const [waConnected, setWaConnected] = useState<boolean>(config?.wa_connected ?? false)

  // Filtros
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<Stage | 'all'>('all')
  const [escalatedOnly, setEscalatedOnly] = useState(false)

  // Envío manual
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Editor de lead en sidebar
  const [savingLead, setSavingLead] = useState(false)

  const openLeadIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const draftRef = useRef<HTMLTextAreaElement | null>(null)

  // ── Carga de la lista con filtros ──
  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ limit: '100' })
    if (search.trim()) params.set('search', search.trim())
    if (stage !== 'all') params.set('stage', stage)
    if (escalatedOnly) params.set('escalated', 'true')

    const r = await api.get<{
      conversations: ConvoSummary[]
      total: number
      wa_connected?: boolean
    }>(`/api/conversations?${params.toString()}`)

    if (r.data) {
      setConvos(r.data.conversations)
      setTotal(r.data.total)
      setListError(null)
      if (typeof r.data.wa_connected === 'boolean') setWaConnected(r.data.wa_connected)
    } else if (r.error) {
      setListError(r.error)
    }
  }, [search, stage, escalatedOnly])

  useEffect(() => {
    setLoading(true)
    loadList().finally(() => setLoading(false))
  }, [loadList])

  // ── Cargar detalle ──
  const loadDetail = useCallback(async (leadId: string, silent = false) => {
    if (!silent) setDetailLoading(true)
    const r = await api.get<ConvoDetail>(`/api/leads/${leadId}/conversation`)
    if (r.data) setDetail(r.data)
    if (!silent) setDetailLoading(false)
  }, [])

  const openConvo = async (leadId: string) => {
    openLeadIdRef.current = leadId
    setSendError(null)
    setDraft('')
    await loadDetail(leadId)
    // Marcar como leída
    api.post(`/api/leads/${leadId}/conversation/read`, { read: true }).catch(() => {})
  }

  // ── Polling de respaldo ──
  useEffect(() => {
    const id = setInterval(() => {
      loadList()
      if (openLeadIdRef.current) loadDetail(openLeadIdRef.current, true)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [loadList, loadDetail])

  // ── Realtime ──
  useEffect(() => {
    if (!clinic?.id) return
    const channel = supabase
      .channel(`conversations:${clinic.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `clinic_id=eq.${clinic.id}` },
        (payload) => {
          loadList()
          const changed = (payload.new ?? payload.old) as { lead_id?: string } | null
          if (openLeadIdRef.current && changed?.lead_id === openLeadIdRef.current) {
            loadDetail(openLeadIdRef.current, true)
          }
        },
      )
      .subscribe((status) => setLiveConnected(status === 'SUBSCRIBED'))

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinic?.id, loadList, loadDetail])

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [detail?.conversation.messages.length])

  // ── Sync waConnected con config ──
  useEffect(() => {
    if (typeof config?.wa_connected === 'boolean') setWaConnected(config.wa_connected)
  }, [config?.wa_connected])

  // ── Enviar mensaje manual ──
  const sendManual = async () => {
    if (!detail || !draft.trim()) return
    setSending(true)
    setSendError(null)
    const r = await api.post<{ success: boolean; message: Message }>(
      `/api/leads/${detail.lead.id}/messages`,
      { text: draft.trim() },
    )
    if (r.error) {
      setSendError(r.error)
    } else {
      setDraft('')
      // Optimistic: agregar inmediatamente
      if (r.data?.message) {
        setDetail((d) => d
          ? { ...d, conversation: { ...d.conversation, messages: [...d.conversation.messages, r.data!.message] } }
          : d)
      }
      loadList()
    }
    setSending(false)
    draftRef.current?.focus()
  }

  // ── Actualizar lead (stage/urgency) ──
  const updateLead = async (patch: Partial<LeadDetail>) => {
    if (!detail) return
    setSavingLead(true)
    const r = await api.patch<{ lead: LeadDetail }>(`/api/leads/${detail.lead.id}`, patch)
    if (r.data?.lead) {
      setDetail((d) => d ? { ...d, lead: { ...d.lead, ...r.data!.lead } } : d)
      loadList()
    }
    setSavingLead(false)
  }

  // ── Métricas top ──
  const stats = useMemo(() => {
    const escalated = convos.filter((c) => c.escalated).length
    const withVision = convos.filter((c) => c.has_vision).length
    return { total, escalated, withVision }
  }, [convos, total])

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Conversaciones"
        subtitle={
          waConnected
            ? `${stats.total} conversaciones · ${stats.escalated} escaladas · ${stats.withVision} con foto`
            : 'WhatsApp desconectado'
        }
        action={
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium ${
              liveConnected ? 'bg-lime-500/15 text-lime-300' : 'bg-zinc-700/40 text-zinc-400'
            }`}
            title={liveConnected ? 'Supabase Realtime activo' : 'Polling 12s de respaldo'}
          >
            {liveConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {liveConnected ? 'En vivo' : 'Polling'}
          </span>
        }
      />

      {/* Banner: WhatsApp desconectado */}
      {!waConnected && (
        <Card className="mb-5 border-amber-500/30 bg-amber-500/[0.06]">
          <div className="flex items-start gap-3">
            <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-200">WhatsApp no está conectado</p>
              <p className="mt-0.5 text-xs text-amber-200/70">
                Conecta tu número en la sección de WhatsApp para empezar a recibir y atender pacientes.
                Hasta que conectes, las conversaciones aparecerán vacías.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Filtros */}
      {waConnected && (
        <Card className="mb-5 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {/* Búsqueda */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o teléfono…"
                className="w-full rounded-lg border border-dark-500 bg-dark-700 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50"
              />
            </div>

            {/* Chips de stage */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-zinc-500" />
              {STAGES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStage(s.value)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    stage === s.value
                      ? 'border-lime-500/50 bg-lime-500/15 text-lime-300'
                      : 'border-dark-500 bg-dark-700 text-zinc-400 hover:border-dark-400'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Toggle escalado */}
            <button
              onClick={() => setEscalatedOnly((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                escalatedOnly
                  ? 'border-red-500/40 bg-red-500/15 text-red-300'
                  : 'border-dark-500 bg-dark-700 text-zinc-400 hover:border-dark-400'
              }`}
              title="Solo conversaciones escaladas a humano"
            >
              <AlertTriangle className="h-3 w-3" /> Escaladas
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Lista */}
        <div className="lg:col-span-4">
          <Card className="p-0">
            {!waConnected ? (
              <div className="py-16 text-center">
                <WifiOff className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
                <p className="text-sm text-zinc-400">Sin conversaciones</p>
                <p className="mt-1 text-xs text-zinc-600">Conecta WhatsApp para empezar.</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-lime-400" />
              </div>
            ) : listError && convos.length === 0 ? (
              <div className="py-12 text-center">
                <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
                <p className="text-sm text-red-300">{listError}</p>
                <button
                  onClick={() => { setLoading(true); loadList().finally(() => setLoading(false)) }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dark-500 bg-dark-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-dark-400"
                >
                  <RefreshCw className="h-3 w-3" /> Reintentar
                </button>
              </div>
            ) : convos.length === 0 ? (
              <div className="py-16 text-center">
                <MessageSquare className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
                <p className="text-sm text-zinc-500">Sin resultados</p>
                <p className="text-xs text-zinc-600">
                  {search || stage !== 'all' || escalatedOnly
                    ? 'Ajusta los filtros o limpia la búsqueda.'
                    : 'Cuando un paciente escriba, aparecerá aquí.'}
                </p>
              </div>
            ) : (
              <div className="max-h-[70vh] divide-y divide-dark-600 overflow-y-auto">
                {convos.map((c) => {
                  const selected = detail?.lead?.id === c.lead_id
                  const displayName = c.leads?.name ?? c.leads?.phone ?? 'Sin nombre'
                  const lastPreview = c.last_message?.content ?? 'Sin mensajes aún'
                  const prefix = c.last_message?.role === 'assistant' ? 'Tú: ' : ''
                  const urgency = c.leads?.urgency_level
                  return (
                    <button
                      key={c.id}
                      onClick={() => openConvo(c.lead_id)}
                      className={`block w-full px-4 py-3 text-left transition-colors hover:bg-dark-700 ${
                        selected ? 'bg-dark-700' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-white">{displayName}</p>
                            {c.escalated && (
                              <span title="Escalada a humano">
                                <AlertTriangle className="h-3 w-3 shrink-0 text-red-400" />
                              </span>
                            )}
                            {c.has_vision && (
                              <span title="Tiene análisis de foto">
                                <ImageIcon className="h-3 w-3 shrink-0 text-blue-400" />
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            {prefix}{lastPreview}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] text-zinc-500">
                            {formatRelative(c.updated_at)}
                          </span>
                          <Badge stage={c.leads?.stage}>{c.leads?.stage}</Badge>
                        </div>
                      </div>
                      {urgency && urgency !== 'low' && (
                        <span
                          className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${URGENCY_COLOR[urgency]}`}
                        >
                          {urgency}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Chat */}
        <div className="lg:col-span-5">
          <Card className="flex h-[78vh] flex-col p-0">
            {detailLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-lime-400" />
              </div>
            ) : !detail ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <MessageSquare className="mb-3 h-10 w-10 text-zinc-700" />
                <p className="text-sm text-zinc-500">
                  {waConnected
                    ? 'Selecciona una conversación para ver los mensajes'
                    : 'Conecta WhatsApp para empezar a atender pacientes'}
                </p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-dark-600 px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {detail.lead.name ?? detail.lead.phone}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {detail.lead.phone} · Score {detail.lead.score} · {detail.conversation.messages.length} mensajes
                    </p>
                  </div>
                  {(detail.conversation.context as { escalated?: boolean })?.escalated && (
                    <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-red-300">
                      <AlertTriangle className="h-3 w-3" /> Escalada
                    </span>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {detail.conversation.messages.length === 0 ? (
                    <p className="py-12 text-center text-sm text-zinc-600">
                      Sin mensajes. La conversación inicia cuando el paciente escribe por WhatsApp.
                    </p>
                  ) : (
                    detail.conversation.messages.map((msg, i) => {
                      const isAssistant = msg.role === 'assistant'
                      const isHistoric = msg.source === 'history'
                      const isDoctorPhone = msg.source === 'outgoing' && !msg.manual
                      const isManual = !!msg.manual
                      return (
                        <div key={i} className={`flex gap-3 ${isAssistant ? '' : 'flex-row-reverse'}`}>
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            isAssistant ? (isManual ? 'bg-violet-500/20' : 'bg-lime-500/20') : 'bg-dark-500'
                          }`}>
                            {isAssistant
                              ? (isManual
                                  ? <User className="h-3.5 w-3.5 text-violet-300" />
                                  : <Bot className="h-3.5 w-3.5 text-lime-400" />)
                              : <User className="h-3.5 w-3.5 text-zinc-400" />
                            }
                          </div>
                          <div
                            className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
                              isAssistant
                                ? (isManual ? 'bg-violet-500/10 text-violet-100' : 'bg-dark-600 text-zinc-200')
                                : 'bg-lime-500/15 text-white'
                            }`}
                          >
                            {msg.analyzed && (
                              <div className="mb-1 flex items-center gap-1 text-[10px] text-blue-300">
                                <Sparkles className="h-3 w-3" /> Analizado por IA
                              </div>
                            )}
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-500">
                              <span>{formatMessageTime(msg.timestamp)}</span>
                              {isHistoric && (
                                <span className="rounded bg-zinc-700/50 px-1 py-px uppercase tracking-wide text-zinc-400">
                                  Histórico
                                </span>
                              )}
                              {isDoctorPhone && (
                                <span className="rounded bg-violet-500/15 px-1 py-px uppercase tracking-wide text-violet-300">
                                  Desde tu teléfono
                                </span>
                              )}
                              {isManual && (
                                <span className="rounded bg-violet-500/20 px-1 py-px uppercase tracking-wide text-violet-300">
                                  Enviado desde panel
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Composer */}
                <div className="border-t border-dark-600 p-3">
                  {sendError && (
                    <p className="mb-2 flex items-center gap-1.5 text-xs text-red-300">
                      <AlertCircle className="h-3 w-3" /> {sendError}
                    </p>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={draftRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          sendManual()
                        }
                      }}
                      rows={1}
                      disabled={!waConnected}
                      placeholder={waConnected ? 'Escribe un mensaje (Enter para enviar)' : 'WhatsApp desconectado'}
                      className="max-h-32 flex-1 resize-none rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50 disabled:opacity-50"
                    />
                    <button
                      onClick={sendManual}
                      disabled={!waConnected || sending || !draft.trim()}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime-500 text-dark-900 transition-colors hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Enviar"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Lead sidebar */}
        <div className="lg:col-span-3">
          {!detail ? (
            <Card>
              <p className="py-8 text-center text-xs text-zinc-600">
                Selecciona una conversación para ver los datos del paciente.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <div className="mb-3 flex items-center gap-2">
                  <User className="h-4 w-4 text-lime-400" />
                  <h3 className="text-sm font-semibold text-white">Paciente</h3>
                </div>
                <p className="text-sm font-medium text-white">{detail.lead.name ?? 'Sin nombre'}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                  <Phone className="h-3 w-3" /> {detail.lead.phone}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg border border-dark-500 bg-dark-700 px-2.5 py-1.5">
                    <p className="text-zinc-500">Score</p>
                    <p className="font-semibold text-lime-300">{detail.lead.score}</p>
                  </div>
                  <div className="rounded-lg border border-dark-500 bg-dark-700 px-2.5 py-1.5">
                    <p className="text-zinc-500">Mensajes</p>
                    <p className="font-semibold text-white">{detail.conversation.messages.length}</p>
                  </div>
                </div>
                {detail.lead.treatment_interest && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-300">
                    <Tag className="h-3 w-3 text-lime-400" /> {detail.lead.treatment_interest}
                  </div>
                )}
              </Card>

              {/* Stage selector */}
              <Card>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Etapa</h3>
                <select
                  value={detail.lead.stage}
                  onChange={(e) => updateLead({ stage: e.target.value as Stage })}
                  disabled={savingLead}
                  className="w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-sm text-white outline-none focus:border-lime-500/50"
                >
                  {STAGES.filter((s) => s.value !== 'all').map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </Card>

              {/* Urgency selector */}
              <Card>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Urgencia</h3>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['low', 'medium', 'high', 'emergency'] as Urgency[]).map((u) => (
                    <button
                      key={u}
                      onClick={() => updateLead({ urgency_level: u })}
                      disabled={savingLead}
                      className={`rounded-lg border px-1 py-1.5 text-[10px] font-medium uppercase transition-colors ${
                        detail.lead.urgency_level === u
                          ? 'border-lime-500/50 bg-lime-500/10 text-lime-300'
                          : 'border-dark-500 bg-dark-700 text-zinc-400 hover:border-dark-400'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </Card>

              {/* Acciones rápidas */}
              <Card>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Acciones rápidas</h3>
                <div className="space-y-1.5">
                  {(detail.conversation.context as { escalated?: boolean })?.escalated && (
                    <button
                      onClick={async () => {
                        await api.post(`/api/leads/${detail.lead.id}/conversation/read`, { read: true })
                        loadDetail(detail.lead.id, true)
                      }}
                      className="flex w-full items-center gap-2 rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-xs text-zinc-300 hover:border-dark-400"
                    >
                      <CheckCheck className="h-3.5 w-3.5 text-lime-400" /> Marcar como atendida
                    </button>
                  )}
                  <button
                    onClick={() => updateLead({ stage: 'scheduled' })}
                    disabled={savingLead}
                    className="flex w-full items-center gap-2 rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-xs text-zinc-300 hover:border-dark-400"
                  >
                    <CheckCheck className="h-3.5 w-3.5 text-lime-400" /> Marcar agendada
                  </button>
                  <button
                    onClick={() => updateLead({ stage: 'lost' })}
                    disabled={savingLead}
                    className="flex w-full items-center gap-2 rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-xs text-zinc-300 hover:border-dark-400"
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-zinc-500" /> Marcar perdida
                  </button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
