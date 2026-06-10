import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import { MessageSquare, User, Bot } from 'lucide-react'

interface ConvoSummary {
  id: string; lead_id: string; total_tokens: number; updated_at: string
  leads: { id: string; name: string | null; phone: string; stage: string; score: number }
}
interface Message {
  role: 'user' | 'assistant'; content: string; timestamp: string; type: string
}
interface ConvoDetail {
  lead: { id: string; name: string | null; phone: string; stage: string; score: number }
  conversation: { id: string | null; messages: Message[]; context: Record<string, unknown>; total_tokens: number }
}

export default function Conversations() {
  const [convos, setConvos] = useState<ConvoSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ConvoDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    api.get<{ conversations: ConvoSummary[]; total: number }>('/api/conversations?limit=100').then((r) => {
      if (r.data) { setConvos(r.data.conversations); setTotal(r.data.total) }
      setLoading(false)
    })
  }, [])

  const openConvo = async (leadId: string) => {
    setDetailLoading(true)
    const r = await api.get<ConvoDetail>(`/api/leads/${leadId}/conversation`)
    if (r.data) setDetail(r.data)
    setDetailLoading(false)
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Conversaciones" subtitle={`${total} conversaciones activas`} />

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
                    {detail.lead.phone} · Score {detail.lead.score} · {detail.conversation.total_tokens} tokens
                  </p>
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {detail.conversation.messages.length === 0 ? (
                    <p className="py-12 text-center text-sm text-zinc-600">
                      Sin mensajes. La conversación inicia cuando el paciente escribe por WhatsApp.
                    </p>
                  ) : (
                    detail.conversation.messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex gap-3 ${msg.role === 'assistant' ? '' : 'flex-row-reverse'}`}
                      >
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          msg.role === 'assistant' ? 'bg-lime-500/20' : 'bg-dark-500'
                        }`}>
                          {msg.role === 'assistant'
                            ? <Bot className="h-3.5 w-3.5 text-lime-400" />
                            : <User className="h-3.5 w-3.5 text-zinc-400" />
                          }
                        </div>
                        <div
                          className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
                            msg.role === 'assistant'
                              ? 'bg-dark-600 text-zinc-200'
                              : 'bg-lime-500/15 text-white'
                          }`}
                        >
                          <p>{msg.content}</p>
                          <p className="mt-1 text-[10px] text-zinc-600">
                            {new Date(msg.timestamp).toLocaleTimeString('es-MX', {
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
