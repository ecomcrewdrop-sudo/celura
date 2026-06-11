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
  Copy,
  Check,
  ExternalLink,
  Pencil,
  Save,
  X,
  FileText,
  Zap,
  ArrowUpDown,
  Clock,
  Activity,
  Mic,
  KeyRound,
  Bell,
  BellOff,
  Plus,
  Trash2,
} from 'lucide-react'

type Stage = 'new' | 'contacted' | 'warm' | 'interested' | 'scheduled' | 'attended' | 'recurring' | 'lost'
type Urgency = 'low' | 'medium' | 'high' | 'emergency'
type SortKey = 'recent' | 'score' | 'urgency' | 'unread'

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
  read_at?: string | null
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

interface ConvoContext {
  escalated?: boolean
  read_at?: string | null
  last_intent?: string | null
  vision_history?: unknown[]
}

interface ConvoDetail {
  lead: LeadDetail
  conversation: {
    id: string | null
    messages: Message[]
    context: ConvoContext
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

const URGENCY_RANK: Record<Urgency, number> = { emergency: 4, high: 3, medium: 2, low: 1 }

const DEFAULT_TEMPLATES: { id: string; label: string; body: string }[] = [
  { id: 't_saludo', label: 'Saludo', body: '¡Hola! 👋 Soy del consultorio. ¿En qué puedo ayudarte hoy?' },
  { id: 't_foto', label: 'Pedir foto', body: '¿Podrías enviarme una foto clara de la zona afectada para revisarla?' },
  { id: 't_horarios', label: 'Horarios', body: 'Nuestros horarios son de lunes a viernes de 9:00 a 19:00 y sábados de 9:00 a 14:00.' },
  { id: 't_precios', label: 'Precios', body: 'Te paso info de precios en breve. ¿Qué tratamiento te interesa?' },
  { id: 't_agendar', label: 'Confirmar cita', body: '¡Listo! Tu cita queda agendada. Te confirmamos con un recordatorio el día anterior. 🦷' },
  { id: 't_direccion', label: 'Dirección', body: 'Nos encuentras en {{DIRECCIÓN}}. Te paso el ubicación por aquí: {{LINK}}' },
]

const LS_TEMPLATES_KEY = 'celura.templates.v1'
const LS_SOUND_KEY = 'celura.notify.sound'

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
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Hoy'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-MX', { weekday: 'long', month: 'short', day: 'numeric' })
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString()
}

function digits(p: string): string {
  return (p || '').replace(/\D/g, '')
}

function initials(name: string | null, phone: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  }
  return digits(phone).slice(-2) || '##'
}

function isUnread(c: ConvoSummary): boolean {
  if (!c.last_message) return false
  if (c.last_message.role !== 'user') return false
  const last = new Date(c.updated_at).getTime()
  const read = c.read_at ? new Date(c.read_at).getTime() : 0
  return last > read
}

function loadTemplates(): typeof DEFAULT_TEMPLATES {
  try {
    const raw = localStorage.getItem(LS_TEMPLATES_KEY)
    if (!raw) return DEFAULT_TEMPLATES
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length) return parsed
  } catch { /* noop */ }
  return DEFAULT_TEMPLATES
}

function saveTemplates(t: typeof DEFAULT_TEMPLATES) {
  try { localStorage.setItem(LS_TEMPLATES_KEY, JSON.stringify(t)) } catch { /* noop */ }
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
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('recent')

  // Envío manual
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Templates
  const [templates, setTemplates] = useState(loadTemplates)
  const [showTemplates, setShowTemplates] = useState(false)
  const [editingTemplates, setEditingTemplates] = useState(false)

  // Notas + edición inline
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [editingTreatment, setEditingTreatment] = useState(false)
  const [treatmentDraft, setTreatmentDraft] = useState('')

  // Misc
  const [copiedPhone, setCopiedPhone] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [soundOn, setSoundOn] = useState<boolean>(() => localStorage.getItem(LS_SOUND_KEY) !== '0')
  const [savingLead, setSavingLead] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const openLeadIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const draftRef = useRef<HTMLTextAreaElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const lastUserTimestampRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // ── Carga lista ──
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

  // ── Detalle ──
  const loadDetail = useCallback(async (leadId: string, silent = false) => {
    if (!silent) setDetailLoading(true)
    const r = await api.get<ConvoDetail>(`/api/leads/${leadId}/conversation`)
    if (r.data) {
      setDetail(r.data)
      setNotesDraft(r.data.lead.notes ?? '')
      setNameDraft(r.data.lead.name ?? '')
      setTreatmentDraft(r.data.lead.treatment_interest ?? '')
    }
    if (!silent) setDetailLoading(false)
  }, [])

  const openConvo = async (leadId: string) => {
    openLeadIdRef.current = leadId
    setSendError(null)
    setDraft('')
    setEditingName(false)
    setEditingTreatment(false)
    setShowTemplates(false)
    await loadDetail(leadId)
    api.post(`/api/leads/${leadId}/conversation/read`, { read: true }).catch(() => {})
    // Optimistic: marcar localmente como leída
    setConvos((cs) => cs.map((c) => (c.lead_id === leadId ? { ...c, read_at: new Date().toISOString() } : c)))
  }

  // ── Polling ──
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

    return () => { supabase.removeChannel(channel) }
  }, [clinic?.id, loadList, loadDetail])

  // ── Auto-scroll + sonido ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    const msgs = detail?.conversation.messages ?? []
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'user' && last.timestamp !== lastUserTimestampRef.current) {
      if (lastUserTimestampRef.current && soundOn) {
        try { audioRef.current?.play().catch(() => {}) } catch { /* noop */ }
      }
      lastUserTimestampRef.current = last.timestamp
    }
  }, [detail?.conversation.messages, soundOn])

  // ── Sync waConnected ──
  useEffect(() => {
    if (typeof config?.wa_connected === 'boolean') setWaConnected(config.wa_connected)
  }, [config?.wa_connected])

  // ── Enviar mensaje ──
  const sendManual = async (textOverride?: string) => {
    const text = (textOverride ?? draft).trim()
    if (!detail || !text) return
    setSending(true)
    setSendError(null)
    const r = await api.post<{ success: boolean; message: Message }>(
      `/api/leads/${detail.lead.id}/messages`,
      { text },
    )
    if (r.error) {
      setSendError(r.error)
    } else {
      setDraft('')
      setShowTemplates(false)
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

  // ── Patch lead ──
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

  // ── Notas (debounced via blur) ──
  const saveNotes = async () => {
    if (!detail) return
    if ((detail.lead.notes ?? '') === notesDraft) return
    setNotesSaving(true)
    await updateLead({ notes: notesDraft || null })
    setNotesSaving(false)
  }

  // ── Copy phone ──
  const copyPhone = async () => {
    if (!detail) return
    try {
      await navigator.clipboard.writeText(detail.lead.phone)
      setCopiedPhone(true)
      setTimeout(() => setCopiedPhone(false), 1400)
    } catch { /* noop */ }
  }

  // ── Sort + filter local ──
  const visibleConvos = useMemo(() => {
    let arr = [...convos]
    if (unreadOnly) arr = arr.filter(isUnread)
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'score':
          return (b.leads?.score ?? 0) - (a.leads?.score ?? 0)
        case 'urgency': {
          const au = a.leads?.urgency_level ?? 'low'
          const bu = b.leads?.urgency_level ?? 'low'
          return URGENCY_RANK[bu] - URGENCY_RANK[au]
        }
        case 'unread': {
          const ua = isUnread(a) ? 1 : 0
          const ub = isUnread(b) ? 1 : 0
          if (ua !== ub) return ub - ua
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        }
        case 'recent':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      }
    })
    return arr
  }, [convos, unreadOnly, sortKey])

  // ── Stats ──
  const stats = useMemo(() => {
    const escalated = convos.filter((c) => c.escalated).length
    const withVision = convos.filter((c) => c.has_vision).length
    const unread = convos.filter(isUnread).length
    const todayKey = new Date().toDateString()
    const today = convos.filter((c) => dayKey(c.updated_at) === todayKey).length
    return { total, escalated, withVision, unread, today }
  }, [convos, total])

  // ── Atajos de teclado ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'Escape') {
        if (lightbox) { setLightbox(null); return }
        if (showTemplates) { setShowTemplates(false); return }
        if (inField) (e.target as HTMLElement).blur()
        return
      }
      if (inField) return
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (e.key === '?') { setShowShortcuts((v) => !v); return }
      if (e.key === 'r' && detail) { e.preventDefault(); draftRef.current?.focus(); return }
      if (e.key === 'j' || e.key === 'k') {
        if (visibleConvos.length === 0) return
        const idx = visibleConvos.findIndex((c) => c.lead_id === detail?.lead.id)
        const next = e.key === 'j'
          ? Math.min(visibleConvos.length - 1, idx + 1)
          : Math.max(0, idx - 1)
        const target = visibleConvos[idx === -1 ? 0 : next]
        if (target) openConvo(target.lead_id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleConvos, detail?.lead.id, showTemplates, lightbox])

  // ── Templates CRUD ──
  const addTemplate = () => {
    const next = [...templates, { id: `t_${Date.now()}`, label: 'Nueva plantilla', body: '' }]
    setTemplates(next); saveTemplates(next)
  }
  const updateTemplate = (id: string, patch: Partial<{ label: string; body: string }>) => {
    const next = templates.map((t) => (t.id === id ? { ...t, ...patch } : t))
    setTemplates(next); saveTemplates(next)
  }
  const deleteTemplate = (id: string) => {
    const next = templates.filter((t) => t.id !== id)
    setTemplates(next); saveTemplates(next)
  }

  const toggleSound = () => {
    setSoundOn((v) => {
      const n = !v
      localStorage.setItem(LS_SOUND_KEY, n ? '1' : '0')
      return n
    })
  }

  // ── Mensajes con separadores de día ──
  const renderMessages = () => {
    if (!detail) return null
    const msgs = detail.conversation.messages
    if (msgs.length === 0) {
      return (
        <p className="py-12 text-center text-sm text-zinc-600">
          Sin mensajes. La conversación inicia cuando el paciente escribe por WhatsApp.
        </p>
      )
    }
    const out: React.ReactNode[] = []
    let lastDay = ''
    msgs.forEach((msg, i) => {
      const k = dayKey(msg.timestamp)
      if (k !== lastDay) {
        out.push(
          <div key={`d-${k}-${i}`} className="my-2 flex items-center gap-2">
            <div className="h-px flex-1 bg-dark-600" />
            <span className="rounded-full bg-dark-700 px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
              {dayLabel(msg.timestamp)}
            </span>
            <div className="h-px flex-1 bg-dark-600" />
          </div>,
        )
        lastDay = k
      }
      out.push(renderBubble(msg, i))
    })
    return out
  }

  const renderBubble = (msg: Message, i: number) => {
    const isAssistant = msg.role === 'assistant'
    const isHistoric = msg.source === 'history'
    const isDoctorPhone = msg.source === 'outgoing' && !msg.manual
    const isManual = !!msg.manual
    const isImage = msg.type === 'image' && /^https?:\/\//.test(msg.content)
    const isAudio = msg.type === 'audio'
    return (
      <div key={i} className={`group flex gap-3 ${isAssistant ? '' : 'flex-row-reverse'}`}>
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
        <div className="relative max-w-[75%]">
          <div
            className={`rounded-xl px-4 py-2.5 text-sm ${
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
            {isImage ? (
              <button
                onClick={() => setLightbox(msg.content)}
                className="block overflow-hidden rounded-lg"
                title="Abrir imagen"
              >
                <img src={msg.content} alt="adjunto" className="max-h-56 max-w-[260px] rounded-lg" />
              </button>
            ) : isAudio ? (
              <div className="flex items-center gap-2 text-zinc-300">
                <Mic className="h-3.5 w-3.5 text-lime-400" />
                <span className="text-xs">Nota de voz</span>
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
            )}
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span>{formatMessageTime(msg.timestamp)}</span>
              {isHistoric && (
                <span className="rounded bg-zinc-700/50 px-1 py-px uppercase tracking-wide text-zinc-400">
                  Histórico
                </span>
              )}
              {isDoctorPhone && (
                <span className="rounded bg-violet-500/15 px-1 py-px uppercase tracking-wide text-violet-300">
                  Tu teléfono
                </span>
              )}
              {isManual && (
                <span className="rounded bg-violet-500/20 px-1 py-px uppercase tracking-wide text-violet-300">
                  Panel
                </span>
              )}
            </div>
          </div>
          {!isImage && !isAudio && (
            <button
              onClick={() => navigator.clipboard.writeText(msg.content).catch(() => {})}
              className={`absolute -top-2 ${isAssistant ? '-right-2' : '-left-2'} hidden h-6 w-6 items-center justify-center rounded-full bg-dark-700 text-zinc-400 ring-1 ring-dark-500 hover:text-white group-hover:flex`}
              title="Copiar mensaje"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Timeline de eventos ──
  const timeline = useMemo(() => {
    if (!detail) return [] as { icon: React.ReactNode; label: string; when: string }[]
    const events: { icon: React.ReactNode; label: string; when: string }[] = []
    if (detail.lead.first_contact_at) {
      events.push({
        icon: <MessageSquare className="h-3 w-3 text-zinc-400" />,
        label: 'Primer contacto',
        when: detail.lead.first_contact_at,
      })
    }
    const msgs = detail.conversation.messages
    const firstAssistant = msgs.find((m) => m.role === 'assistant')
    if (firstAssistant) {
      events.push({
        icon: <Bot className="h-3 w-3 text-lime-400" />,
        label: 'IA respondió',
        when: firstAssistant.timestamp,
      })
    }
    if (detail.conversation.context?.escalated) {
      const escAt = msgs.find((m) => m.role === 'user')?.timestamp ?? detail.conversation.updated_at
      if (escAt) {
        events.push({
          icon: <AlertTriangle className="h-3 w-3 text-red-400" />,
          label: 'Conversación escalada',
          when: escAt,
        })
      }
    }
    if (detail.lead.stage === 'scheduled') {
      events.push({
        icon: <CheckCheck className="h-3 w-3 text-lime-400" />,
        label: 'Cita agendada',
        when: detail.conversation.updated_at ?? new Date().toISOString(),
      })
    }
    return events
  }, [detail])

  return (
    <div className="animate-fade-in">
      {/* Audio para notif sonora (data URI: beep corto) */}
      <audio
        ref={audioRef}
        preload="auto"
        src="data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
      />

      <PageHeader
        title="Conversaciones"
        subtitle={
          waConnected
            ? `${stats.total} en total · ${stats.unread} sin leer · ${stats.today} hoy · ${stats.escalated} escaladas · ${stats.withVision} con foto`
            : 'WhatsApp desconectado'
        }
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                soundOn ? 'bg-dark-700 text-zinc-300 hover:text-white' : 'bg-dark-700 text-zinc-500'
              }`}
              title={soundOn ? 'Silenciar notificaciones' : 'Activar notificaciones'}
            >
              {soundOn ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
              {soundOn ? 'Sonido' : 'Silencio'}
            </button>
            <button
              onClick={() => setShowShortcuts((v) => !v)}
              className="flex items-center gap-1.5 rounded-full bg-dark-700 px-3 py-1 text-[11px] font-medium text-zinc-300 hover:text-white"
              title="Atajos de teclado (?)"
            >
              <KeyRound className="h-3 w-3" /> Atajos
            </button>
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium ${
                liveConnected ? 'bg-lime-500/15 text-lime-300' : 'bg-zinc-700/40 text-zinc-400'
              }`}
              title={liveConnected ? 'Supabase Realtime activo' : 'Polling 12s de respaldo'}
            >
              {liveConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {liveConnected ? 'En vivo' : 'Polling'}
            </span>
          </div>
        }
      />

      {/* Panel atajos */}
      {showShortcuts && (
        <Card className="mb-4 border-dark-500 bg-dark-800/80">
          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300 sm:grid-cols-4">
            <div><kbd className="rounded bg-dark-600 px-1.5 py-0.5 text-[10px]">/</kbd> buscar</div>
            <div><kbd className="rounded bg-dark-600 px-1.5 py-0.5 text-[10px]">J</kbd> / <kbd className="rounded bg-dark-600 px-1.5 py-0.5 text-[10px]">K</kbd> navegar</div>
            <div><kbd className="rounded bg-dark-600 px-1.5 py-0.5 text-[10px]">R</kbd> responder</div>
            <div><kbd className="rounded bg-dark-600 px-1.5 py-0.5 text-[10px]">Esc</kbd> cerrar</div>
            <div><kbd className="rounded bg-dark-600 px-1.5 py-0.5 text-[10px]">Enter</kbd> enviar</div>
            <div><kbd className="rounded bg-dark-600 px-1.5 py-0.5 text-[10px]">Shift</kbd>+<kbd className="rounded bg-dark-600 px-1.5 py-0.5 text-[10px]">Enter</kbd> nueva línea</div>
            <div><kbd className="rounded bg-dark-600 px-1.5 py-0.5 text-[10px]">?</kbd> mostrar/ocultar</div>
          </div>
        </Card>
      )}

      {/* Banner desconectado */}
      {!waConnected && (
        <Card className="mb-5 border-amber-500/30 bg-amber-500/[0.06]">
          <div className="flex items-start gap-3">
            <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-200">WhatsApp no está conectado</p>
              <p className="mt-0.5 text-xs text-amber-200/70">
                Conecta tu número en la sección de WhatsApp para empezar a recibir y atender pacientes.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Filtros */}
      {waConnected && (
        <Card className="mb-5 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o teléfono (/)…"
                className="w-full rounded-lg border border-dark-500 bg-dark-700 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50"
              />
            </div>

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

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setEscalatedOnly((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  escalatedOnly
                    ? 'border-red-500/40 bg-red-500/15 text-red-300'
                    : 'border-dark-500 bg-dark-700 text-zinc-400 hover:border-dark-400'
                }`}
              >
                <AlertTriangle className="h-3 w-3" /> Escaladas
              </button>
              <button
                onClick={() => setUnreadOnly((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  unreadOnly
                    ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                    : 'border-dark-500 bg-dark-700 text-zinc-400 hover:border-dark-400'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Sin leer
              </button>
              <div className="relative">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="appearance-none rounded-full border border-dark-500 bg-dark-700 px-3 py-1.5 pr-7 text-[11px] font-medium text-zinc-300 outline-none focus:border-lime-500/50"
                >
                  <option value="recent">Recientes</option>
                  <option value="unread">Sin leer primero</option>
                  <option value="score">Mayor score</option>
                  <option value="urgency">Urgencia</option>
                </select>
                <ArrowUpDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Lista */}
        <div className="lg:w-[300px] lg:shrink-0">
          <Card className="flex h-[78vh] flex-col p-0">
            {!waConnected ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
                <WifiOff className="mb-3 h-8 w-8 text-zinc-600" />
                <p className="text-sm text-zinc-400">Sin conversaciones</p>
                <p className="mt-1 text-xs text-zinc-600">Conecta WhatsApp para empezar.</p>
              </div>
            ) : loading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-lime-400" />
              </div>
            ) : listError && convos.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
                <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
                <p className="text-sm text-red-300">{listError}</p>
                <button
                  onClick={() => { setLoading(true); loadList().finally(() => setLoading(false)) }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dark-500 bg-dark-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-dark-400"
                >
                  <RefreshCw className="h-3 w-3" /> Reintentar
                </button>
              </div>
            ) : visibleConvos.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
                <MessageSquare className="mb-3 h-8 w-8 text-zinc-600" />
                <p className="text-sm text-zinc-500">Sin resultados</p>
                <p className="text-xs text-zinc-600">
                  {search || stage !== 'all' || escalatedOnly || unreadOnly
                    ? 'Ajusta los filtros o limpia la búsqueda.'
                    : 'Cuando un paciente escriba, aparecerá aquí.'}
                </p>
              </div>
            ) : (
              <div className="flex-1 divide-y divide-dark-600 overflow-y-auto">
                {visibleConvos.map((c) => {
                  const selected = detail?.lead?.id === c.lead_id
                  const displayName = c.leads?.name ?? c.leads?.phone ?? 'Sin nombre'
                  const lastPreview = c.last_message?.content ?? 'Sin mensajes aún'
                  const prefix = c.last_message?.role === 'assistant' ? 'Tú: ' : ''
                  const urgency = c.leads?.urgency_level
                  const unread = isUnread(c)
                  return (
                    <button
                      key={c.id}
                      onClick={() => openConvo(c.lead_id)}
                      className={`block w-full px-4 py-3 text-left transition-colors hover:bg-dark-700 ${
                        selected ? 'bg-dark-700' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative shrink-0">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold uppercase ${
                            unread ? 'bg-lime-500/20 text-lime-300' : 'bg-dark-600 text-zinc-300'
                          }`}>
                            {initials(c.leads?.name ?? null, c.leads?.phone ?? '')}
                          </div>
                          {unread && (
                            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-blue-400 ring-2 ring-dark-800" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className={`truncate text-sm ${unread ? 'font-semibold text-white' : 'font-medium text-zinc-200'}`}>
                              {displayName}
                            </p>
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
                          <p className={`mt-0.5 truncate text-xs ${unread ? 'text-zinc-300' : 'text-zinc-500'}`}>
                            {prefix}{lastPreview}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <Badge stage={c.leads?.stage}>{c.leads?.stage}</Badge>
                            {urgency && urgency !== 'low' && (
                              <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${URGENCY_COLOR[urgency]}`}>
                                {urgency}
                              </span>
                            )}
                            <span className="ml-auto text-[10px] text-zinc-500">
                              {formatRelative(c.updated_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Chat */}
        <div className="min-w-0 flex-1">
          <Card className="flex h-[78vh] flex-col p-0">
            {detailLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-lime-400" />
              </div>
            ) : !detail ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <MessageSquare className="mb-3 h-10 w-10 text-zinc-700" />
                <p className="text-sm text-zinc-500">
                  {waConnected
                    ? 'Selecciona una conversación para ver los mensajes'
                    : 'Conecta WhatsApp para empezar a atender pacientes'}
                </p>
                {waConnected && (
                  <p className="mt-2 text-[11px] text-zinc-600">
                    Tip: presiona <kbd className="rounded bg-dark-600 px-1 py-0.5">J</kbd>/<kbd className="rounded bg-dark-600 px-1 py-0.5">K</kbd> para navegar la lista
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-dark-600 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime-500/20 text-[11px] font-semibold uppercase text-lime-300">
                      {initials(detail.lead.name, detail.lead.phone)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {detail.lead.name ?? detail.lead.phone}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                        <span className="font-mono">{detail.lead.phone}</span>
                        <span>·</span>
                        <span>Score {detail.lead.score}</span>
                        <span>·</span>
                        <span>{detail.conversation.messages.length} msj</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {detail.conversation.context?.escalated && (
                      <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-red-300">
                        <AlertTriangle className="h-3 w-3" /> Escalada
                      </span>
                    )}
                    <button
                      onClick={copyPhone}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-dark-500 bg-dark-700 text-zinc-400 hover:text-white"
                      title="Copiar teléfono"
                    >
                      {copiedPhone ? <Check className="h-3.5 w-3.5 text-lime-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <a
                      href={`https://wa.me/${digits(detail.lead.phone)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 items-center gap-1.5 rounded-lg border border-dark-500 bg-dark-700 px-2 text-[11px] text-zinc-300 hover:text-white"
                      title="Abrir en WhatsApp"
                    >
                      <ExternalLink className="h-3 w-3" /> WA
                    </a>
                  </div>
                </div>

                {/* Mini meta bar */}
                <div className="flex items-center gap-3 border-b border-dark-600 px-5 py-2 text-[11px] text-zinc-500">
                  {detail.lead.treatment_interest && (
                    <span className="flex items-center gap-1 text-zinc-300">
                      <Tag className="h-3 w-3 text-lime-400" /> {detail.lead.treatment_interest}
                    </span>
                  )}
                  {detail.conversation.context?.last_intent && (
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" /> {detail.conversation.context.last_intent}
                    </span>
                  )}
                  {detail.lead.first_contact_at && (
                    <span className="ml-auto flex items-center gap-1">
                      <Clock className="h-3 w-3" /> primer contacto {formatRelative(detail.lead.first_contact_at)}
                    </span>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {renderMessages()}
                  <div ref={messagesEndRef} />
                </div>

                {/* Templates popover */}
                {showTemplates && (
                  <div className="border-t border-dark-600 bg-dark-800/60 px-3 py-2">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                        <Zap className="h-3 w-3 text-lime-400" /> Plantillas rápidas
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingTemplates((v) => !v)}
                          className="rounded-full bg-dark-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:text-white"
                        >
                          {editingTemplates ? 'Listo' : 'Editar'}
                        </button>
                        {editingTemplates && (
                          <button
                            onClick={addTemplate}
                            className="flex items-center gap-1 rounded-full bg-lime-500/15 px-2 py-0.5 text-[10px] text-lime-300 hover:bg-lime-500/25"
                          >
                            <Plus className="h-3 w-3" /> nueva
                          </button>
                        )}
                        <button
                          onClick={() => setShowTemplates(false)}
                          className="rounded-full bg-dark-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                      {editingTemplates ? (
                        templates.map((t) => (
                          <div key={t.id} className="rounded-lg border border-dark-500 bg-dark-700 p-2">
                            <div className="flex items-center gap-2">
                              <input
                                value={t.label}
                                onChange={(e) => updateTemplate(t.id, { label: e.target.value })}
                                className="flex-1 rounded bg-dark-600 px-2 py-1 text-xs text-white outline-none"
                              />
                              <button
                                onClick={() => deleteTemplate(t.id)}
                                className="rounded p-1 text-red-300 hover:bg-red-500/15"
                                title="Eliminar"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                            <textarea
                              value={t.body}
                              onChange={(e) => updateTemplate(t.id, { body: e.target.value })}
                              rows={2}
                              className="mt-1.5 w-full resize-none rounded bg-dark-600 px-2 py-1 text-xs text-zinc-200 outline-none"
                            />
                          </div>
                        ))
                      ) : (
                        templates.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setDraft(t.body)}
                            className="block w-full rounded-lg border border-dark-500 bg-dark-700 px-2.5 py-1.5 text-left hover:border-lime-500/40"
                          >
                            <p className="text-[11px] font-semibold text-lime-300">{t.label}</p>
                            <p className="mt-0.5 truncate text-[11px] text-zinc-400">{t.body}</p>
                          </button>
                        ))
                      )}
                      {templates.length === 0 && (
                        <p className="py-4 text-center text-[11px] text-zinc-500">Sin plantillas. Crea una arriba.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Composer */}
                <div className="border-t border-dark-600 p-3">
                  {sendError && (
                    <p className="mb-2 flex items-center gap-1.5 text-xs text-red-300">
                      <AlertCircle className="h-3 w-3" /> {sendError}
                    </p>
                  )}
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => setShowTemplates((v) => !v)}
                      disabled={!waConnected}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                        showTemplates
                          ? 'border-lime-500/50 bg-lime-500/15 text-lime-300'
                          : 'border-dark-500 bg-dark-700 text-zinc-400 hover:text-white'
                      } disabled:opacity-40`}
                      title="Plantillas rápidas"
                    >
                      <Zap className="h-4 w-4" />
                    </button>
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
                      placeholder={waConnected ? 'Escribe un mensaje (Enter para enviar, Shift+Enter nueva línea)' : 'WhatsApp desconectado'}
                      className="max-h-32 flex-1 resize-none rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-500/50 disabled:opacity-50"
                    />
                    <div className="flex flex-col items-end gap-1">
                      <button
                        onClick={() => sendManual()}
                        disabled={!waConnected || sending || !draft.trim()}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime-500 text-dark-900 transition-colors hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Enviar"
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                      <span className="text-[10px] text-zinc-500">{draft.length}/2000</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:h-[78vh] lg:w-[320px] lg:shrink-0 lg:overflow-y-auto lg:pr-1">
          {!detail ? (
            <Card className="flex h-full items-center justify-center">
              <p className="px-6 py-8 text-center text-xs text-zinc-600">
                Selecciona una conversación para ver los datos del paciente.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Paciente */}
              <Card>
                <div className="mb-3 flex items-center gap-2">
                  <User className="h-4 w-4 text-lime-400" />
                  <h3 className="text-sm font-semibold text-white">Paciente</h3>
                </div>

                {/* Nombre editable */}
                {editingName ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { updateLead({ name: nameDraft.trim() || undefined }); setEditingName(false) }
                        if (e.key === 'Escape') { setNameDraft(detail.lead.name ?? ''); setEditingName(false) }
                      }}
                      className="flex-1 rounded-lg border border-dark-500 bg-dark-700 px-2 py-1 text-sm text-white outline-none focus:border-lime-500/50"
                    />
                    <button
                      onClick={() => { updateLead({ name: nameDraft.trim() || undefined }); setEditingName(false) }}
                      className="flex h-7 w-7 items-center justify-center rounded bg-lime-500 text-dark-900"
                      title="Guardar"
                    >
                      <Save className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="group flex items-center gap-1.5">
                    <p className="text-sm font-medium text-white">{detail.lead.name ?? 'Sin nombre'}</p>
                    <button
                      onClick={() => { setNameDraft(detail.lead.name ?? ''); setEditingName(true) }}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      title="Editar nombre"
                    >
                      <Pencil className="h-3 w-3 text-zinc-500 hover:text-white" />
                    </button>
                  </div>
                )}

                <button
                  onClick={copyPhone}
                  className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
                  title="Copiar"
                >
                  <Phone className="h-3 w-3" /> {detail.lead.phone}
                  {copiedPhone ? <Check className="h-3 w-3 text-lime-400" /> : <Copy className="h-3 w-3 opacity-50" />}
                </button>

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

                {/* Tratamiento de interés editable */}
                <div className="mt-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Interés</p>
                  {editingTreatment ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={treatmentDraft}
                        onChange={(e) => setTreatmentDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateLead({ treatment_interest: treatmentDraft.trim() || null })
                            setEditingTreatment(false)
                          }
                          if (e.key === 'Escape') {
                            setTreatmentDraft(detail.lead.treatment_interest ?? '')
                            setEditingTreatment(false)
                          }
                        }}
                        placeholder="Limpieza, brackets…"
                        className="flex-1 rounded-lg border border-dark-500 bg-dark-700 px-2 py-1 text-xs text-white outline-none focus:border-lime-500/50"
                      />
                      <button
                        onClick={() => {
                          updateLead({ treatment_interest: treatmentDraft.trim() || null })
                          setEditingTreatment(false)
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded bg-lime-500 text-dark-900"
                      >
                        <Save className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setTreatmentDraft(detail.lead.treatment_interest ?? ''); setEditingTreatment(true) }}
                      className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-dark-500 px-2 py-1.5 text-left text-xs text-zinc-300 hover:border-dark-400"
                    >
                      <Tag className="h-3 w-3 text-lime-400" />
                      {detail.lead.treatment_interest || <span className="italic text-zinc-500">sin definir</span>}
                      <Pencil className="ml-auto h-3 w-3 text-zinc-500" />
                    </button>
                  )}
                </div>
              </Card>

              {/* Etapa */}
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

              {/* Urgencia */}
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

              {/* Notas del doctor */}
              <Card>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <FileText className="h-3 w-3" /> Notas del doctor
                  </h3>
                  {notesSaving && <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />}
                </div>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={saveNotes}
                  rows={4}
                  placeholder="Solo tú ves esto. Diagnóstico, alergias, observaciones…"
                  className="w-full resize-none rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-lime-500/50"
                />
                <p className="mt-1 text-[10px] text-zinc-600">Se guarda al salir del campo.</p>
              </Card>

              {/* Timeline */}
              {timeline.length > 0 && (
                <Card>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <Clock className="h-3 w-3" /> Cronología
                  </h3>
                  <ul className="space-y-2">
                    {timeline.map((ev, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-zinc-300">
                        <span className="mt-0.5">{ev.icon}</span>
                        <div className="flex-1">
                          <p>{ev.label}</p>
                          <p className="text-[10px] text-zinc-500">{formatRelative(ev.when)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* Acciones rápidas */}
              <Card>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Acciones rápidas</h3>
                <div className="space-y-1.5">
                  {detail.conversation.context?.escalated && (
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
                    onClick={() => updateLead({ stage: 'attended' })}
                    disabled={savingLead}
                    className="flex w-full items-center gap-2 rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-xs text-zinc-300 hover:border-dark-400"
                  >
                    <CheckCheck className="h-3.5 w-3.5 text-lime-400" /> Marcar atendida
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

      {/* Lightbox imagen */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <img src={lightbox} alt="vista previa" className="max-h-[90vh] max-w-[90vw] rounded-lg" />
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-dark-700 text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  )
}
