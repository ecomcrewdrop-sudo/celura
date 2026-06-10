import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useClinic } from '@/hooks/useClinic'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import { MessageSquare, User, Bot, Wifi, WifiOff } from 'lucide-react'

interface ConvoSummary {
  id: string; lead_id: string; total_tokens: number; updated_at: string
  leads: { id: string; name: string | null; phone: string; stage: string; score: number }
}
interface Message {
  role: 'user' | 'assistant'; content: string; timestamp: string; type: string
  source?: 'history' | 'outgoing'
}
interface ConvoDetail {
  lead: { id: string; name: string | null; phone: string; stage: string; score: number }
  conversation: { id: string | null; messages: Message[]; context: Record<string, unknown>; total_tokens: number }
}

const POLL_INTERVAL_MS = 12_000

export default function Conversations() {
  const { clinic } = useClinic()
  const [convos, setConvos] = useState<ConvoSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ConvoDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [liveConnected, setLiveConnected] = useState(false)

  const openLeadIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // ── Carga inicial de la lista ──
  const loadList = useCallback(async () => {
    const r = await api.get<{ conversations: ConvoSummary[]; total: number }>(
      '/api/conversations?limit=100',
    )
    if (r.data) {
      setConvos(r.data.conversations)
      setTotal(r.data.total)
    }
  }, [])

  useEffect(() => {
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
    await loadDetail(leadId)
  }

  // ── Polling de respaldo (cada 12s refresca lista + conversación abierta) ──
  useEffect(() => {
    const id = setInterval(() => {
      loadList()
      if (openLeadIdRef.current) loadDetail(openLeadIdRef.current, true)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [loadList, loadDetail])

  // ── Realtime de Supabase ──
  // Escucha cambios en la tabla `conversations` filtrados por clinic_id.
  // Cada UPDATE/INSERT dispara recarga de la lista y, si la conversación abierta cambió,
  // refresca también el detalle para renderizar el mensaje nuevo al instante.
  useEffect(() => {
    if (!clinic?.id) return

    const channel = supabase
      .channel(`conversations:${clinic.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `clinic_id=eq.${clinic.id}`,
        },
        (payload) => {
          // Refresca la lista para reordenar por updated_at
          loadList()

          // Si el cambio es de la conversación abierta, refresca el detalle
          const changed = (payload.new ?? payload.old) as { lead_id?: string } | null
          if (
            openLeadIdRef.current &&
            changed?.lead_id === openLeadIdRef.current
          ) {
            loadDetail(openLeadIdRef.current, true)
          }
        },
      )
      .subscribe((status) => {
        setLiveConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinic?.id, loadList, loadDetail])

  // ── Auto-scroll al fondo cuando llegan mensajes nuevos ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [detail?.conversation.messages.length])

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Conversaciones"
        subtitle={`${total} conversaciones · sincronización en tiempo real`}
        action={
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium ${
              liveConnected
                ? 'bg-lime-500/15 text-lime-300'
                : 'bg-zinc-700/40 text-zinc-400'
            }`}
            title={liveConnected ? 'Conectado a Supabase Realtime' : 'Usando polling de respaldo (12s)'}
          >
            {liveConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {liveConnected ? 'En vivo' : 'Polling'}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Lista */}
        <div className="lg:col-span-1">
          <Card className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" />
              </div>
            ) : convos.length === 0 ? (
              <div className="py-16 text-center">
                <MessageSquare className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
                <p className="text-sm text-zinc-500">Sin conversaciones aún</p>
                <p className="text-xs text-zinc-600">Conecta WhatsApp para empezar a recibir mensajes.</p>
              </div>
            ) : (
              <div className="divide-y divide-dark-600">
                {convos.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => openConvo(c.lead_id)}
                    className={`cursor-pointer px-4 py-3 transition-colors hover:bg-dark-700 ${
                      detail?.lead?.id === c.lead_id ? 'bg-dark-700' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-medium text-white">
                        {c.leads?.name ?? c.leads?.phone ?? 'Sin nombre'}
                      </p>
                      <Badge stage={c.leads?.stage}>{c.leads?.stage}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {new Date(c.updated_at).toLocaleDateString('es-MX', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })} · {c.total_tokens} tokens
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Chat */}
        <div className="lg:col-span-2">
          <Card className="flex h-[600px] flex-col p-0">
            {detailLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" />
              </div>
            ) : !detail ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <MessageSquare className="mb-3 h-10 w-10 text-zinc-700" />
                <p className="text-sm text-zinc-500">Selecciona una conversación para ver los mensajes</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="border-b border-dark-600 px-5 py-3">
                  <p className="text-sm font-semibold text-white">
                    {detail.lead.name ?? detail.lead.phone}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {detail.lead.phone} · Score {detail.lead.score} · {detail.conversation.total_tokens} tokens · {detail.conversation.messages.length} mensajes
                  </p>
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
                      const isDoctorPhone = msg.source === 'outgoing'
                      return (
                        <div
                          key={i}
                          className={`flex gap-3 ${isAssistant ? '' : 'flex-row-reverse'}`}
                        >
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            isAssistant ? 'bg-lime-500/20' : 'bg-dark-500'
                          }`}>
                            {isAssistant
                              ? <Bot className="h-3.5 w-3.5 text-lime-400" />
                              : <User className="h-3.5 w-3.5 text-zinc-400" />
                            }
                          </div>
                          <div
                            className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
                              isAssistant
                                ? 'bg-dark-600 text-zinc-200'
                                : 'bg-lime-500/15 text-white'
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-600">
                              <span>
                                {new Date(msg.timestamp).toLocaleString('es-MX', {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                })}
                              </span>
                              {isHistoric && (
                                <span className="rounded bg-zinc-700/50 px-1 py-px text-[9px] uppercase tracking-wide text-zinc-400">
                                  Histórico
                                </span>
                              )}
                              {isDoctorPhone && (
                                <span className="rounded bg-violet-500/15 px-1 py-px text-[9px] uppercase tracking-wide text-violet-300">
                                  Desde tu teléfono
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
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
