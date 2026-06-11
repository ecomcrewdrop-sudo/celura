// ============================================================
//  CELURA · Pagina WhatsApp - vinculacion + estado en vivo
//  4 estados visuales: disconnected, connecting, qr_ready, connected
//  Polling de status con cadencia adaptativa, countdown QR,
//  modal de confirmacion para desconectar (wipea datos), tips,
//  preview del asistente y acciones rapidas.
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from '@/lib/api'
import { useClinic } from '@/hooks/useClinic'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import {
  Smartphone,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Phone,
  Shield,
  Zap,
  Copy,
  Check,
  Clock,
  Bot,
  ChevronDown,
  Power,
  QrCode,
  Loader2,
  Activity,
  MessageCircle,
  Settings as Cog,
  ExternalLink,
} from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────
interface WAStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | string
  connected: boolean
  phone: string | null
  qr_available: boolean
}
interface QRResponse {
  status: string
  qr_image?: string
  qr_string?: string
  phone?: string
  expires_in?: number
}

// QR vive ~60s segun Baileys. Lo refrescamos automaticamente cuando expira.
const QR_TTL_SEC = 60

// Cadencia adaptativa: mas agresivo cuando hay QR esperando, mas relajado idle.
const POLL_FAST = 2500
const POLL_SLOW = 8000

// ── Helpers ──────────────────────────────────────────────────
const formatPhone = (raw: string | null | undefined): string => {
  if (!raw) return '—'
  // raw viene como E.164 sin '+' o con espacios; normalizar
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 12 || digits.length === 13) {
    // CountryCode (1-3) + resto. Mostrar con espacios cada bloque.
    const cc = digits.slice(0, digits.length - 10)
    const rest = digits.slice(-10)
    return `+${cc} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`
  }
  return `+${digits}`
}

// Cuando vinculo por primera vez en esta sesion, guardo el timestamp local
// para mostrar uptime (la DB tiene wa_connected_at pero no lo expone al frontend).
const CONNECTED_AT_KEY = 'wa_connected_at_local'

const formatUptime = (since: number | null): string => {
  if (!since) return '—'
  const ms = Date.now() - since
  if (ms < 60_000) return 'hace unos segundos'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} d`
}

export default function WhatsApp() {
  const { config, clinic, refresh } = useClinic()
  const [waStatus, setWaStatus] = useState<WAStatus | null>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [qrCountdown, setQrCountdown] = useState<number>(QR_TTL_SEC)
  const [loading, setLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [polling, setPolling] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [copiedPhone, setCopiedPhone] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [connectedAt, setConnectedAt] = useState<number | null>(null)

  // Refs para poder cancelar timers/intervals desde varios puntos
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevConnectedRef = useRef<boolean>(false)

  const connected = !!waStatus?.connected

  // ── Status fetch ──────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    const r = await api.get<WAStatus>('/api/whatsapp/status')
    if (r.data) setWaStatus(r.data)
    return r.data
  }, [])

  // Inicial: status + recuperar timestamp de conexion local si existe
  useEffect(() => {
    checkStatus()
    const saved = localStorage.getItem(CONNECTED_AT_KEY)
    if (saved) setConnectedAt(Number(saved))
  }, [checkStatus])

  // Cuando pasamos de disconnected → connected, marcamos timestamp
  useEffect(() => {
    if (connected && !prevConnectedRef.current) {
      const now = Date.now()
      setConnectedAt(now)
      localStorage.setItem(CONNECTED_AT_KEY, String(now))
    }
    if (!connected && prevConnectedRef.current) {
      localStorage.removeItem(CONNECTED_AT_KEY)
      setConnectedAt(null)
    }
    prevConnectedRef.current = connected
  }, [connected])

  // ── Poll adaptativo: rapido si esperamos vinculacion, lento idle ──
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    const intervalMs = qrImage || polling ? POLL_FAST : POLL_SLOW
    pollRef.current = setInterval(async () => {
      const next = await checkStatus()
      // Si paso a conectado, limpiar QR + refrescar clinica
      if (next?.connected && qrImage) {
        setQrImage(null)
        setPolling(false)
        await refresh()
      }
    }, intervalMs)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [qrImage, polling, checkStatus, refresh])

  // ── Countdown del QR ──────────────────────────────────────
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (!qrImage) return
    setQrCountdown(QR_TTL_SEC)
    countdownRef.current = setInterval(() => {
      setQrCountdown((s) => {
        if (s <= 1) {
          // QR expirado: pedimos otro automaticamente
          generateQR(true)
          return QR_TTL_SEC
        }
        return s - 1
      })
    }, 1000)
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrImage])

  // ── Acciones ──────────────────────────────────────────────
  const generateQR = async (silent = false) => {
    if (!silent) setLoading(true)
    const r = await api.get<QRResponse>('/api/whatsapp/qr')
    if (r.data?.status === 'already_connected') {
      await checkStatus()
      await refresh()
      setLoading(false)
      return
    }
    if (r.data?.qr_image) {
      setQrImage(r.data.qr_image)
      setPolling(true)
    }
    setLoading(false)
  }

  const doDisconnect = async () => {
    setDisconnecting(true)
    await api.post('/api/whatsapp/disconnect', {})
    setDisconnecting(false)
    setConfirmDisconnect(false)
    setWaStatus({ status: 'disconnected', connected: false, phone: null, qr_available: false })
    setQrImage(null)
    setPolling(false)
    localStorage.removeItem(CONNECTED_AT_KEY)
    setConnectedAt(null)
    await refresh()
  }

  const cancelQR = () => {
    setQrImage(null)
    setPolling(false)
    setQrCountdown(QR_TTL_SEC)
  }

  const copyPhone = async () => {
    const phone = waStatus?.phone ?? config?.wa_phone
    if (!phone) return
    await navigator.clipboard.writeText(phone)
    setCopiedPhone(true)
    setTimeout(() => setCopiedPhone(false), 1500)
  }

  // ── Derivados visuales ────────────────────────────────────
  const statusMeta = useMemo(() => {
    if (connected) {
      return {
        label: 'Conectado',
        color: 'text-lime-400',
        bg: 'bg-lime-500/10',
        ring: 'ring-lime-500/30',
        dot: 'bg-lime-400',
      }
    }
    if (qrImage) {
      return {
        label: 'Esperando escaneo',
        color: 'text-amber-300',
        bg: 'bg-amber-500/10',
        ring: 'ring-amber-500/30',
        dot: 'bg-amber-400',
      }
    }
    if (loading || waStatus?.status === 'connecting') {
      return {
        label: 'Conectando…',
        color: 'text-sky-300',
        bg: 'bg-sky-500/10',
        ring: 'ring-sky-500/30',
        dot: 'bg-sky-400',
      }
    }
    return {
      label: 'Desconectado',
      color: 'text-zinc-400',
      bg: 'bg-dark-600/60',
      ring: 'ring-white/[0.06]',
      dot: 'bg-zinc-500',
    }
  }, [connected, qrImage, loading, waStatus?.status])

  // ── FAQ data ──────────────────────────────────────────────
  const faqs = [
    {
      q: '¿Es seguro vincular mi WhatsApp?',
      a: 'Sí. Usamos el protocolo oficial de WhatsApp Web (mismo método que cualquier dispositivo vinculado). Tu número y datos quedan en una sesión cifrada y aislada por clínica. No tenemos acceso a tu cuenta personal.',
    },
    {
      q: '¿Qué pasa si desconecto?',
      a: 'La sesión se cierra y se eliminan conversaciones, leads, follow-ups y citas asociados a esta clínica. Útil para empezar de cero. Tu configuración del asistente se conserva.',
    },
    {
      q: '¿Por qué expira el QR?',
      a: 'WhatsApp regenera el QR cada ~60s por seguridad. Lo refrescamos automáticamente. Si tarda mucho, revisa tu conexión y vuelve a intentarlo.',
    },
    {
      q: '¿Puedo usar un número que ya uso personalmente?',
      a: 'Sí, pero recomendamos un número dedicado para la clínica. El asistente responderá a todos los chats entrantes en ese número.',
    },
    {
      q: '¿Y si el asistente responde algo que no quiero?',
      a: 'Podés ajustar tono, saludo, tratamientos y disparadores de escalación desde Configuración. Si detecta un caso fuera de su alcance, escala al doctor automáticamente.',
    },
  ]

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="WhatsApp"
        subtitle="Vincula tu número y deja que el asistente responda 24/7"
        action={
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${statusMeta.bg} ${statusMeta.ring} ${statusMeta.color}`}>
            <span className={`relative flex h-2 w-2`}>
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${statusMeta.dot}`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${statusMeta.dot}`} />
            </span>
            {statusMeta.label}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ═══════════════ COLUMNA PRINCIPAL (2/3) ═══════════════ */}
        <div className="space-y-5 lg:col-span-2">
          {/* Hero card de estado */}
          <Card className="relative overflow-hidden p-0">
            {/* Fondo decorativo dependiente del estado */}
            <div
              className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
                connected
                  ? 'opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(132,204,22,0.12),transparent_60%)]'
                  : qrImage
                  ? 'opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.10),transparent_60%)]'
                  : 'opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.04),transparent_60%)]'
              }`}
            />

            <div className="relative p-6">
              {/* ── ESTADO: CONECTADO ── */}
              {connected && (
                <div className="space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-lime-500/15 ring-1 ring-lime-500/30">
                        <Wifi className="h-7 w-7 text-lime-400" />
                        <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-75" />
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-lime-400" />
                        </span>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-wider text-lime-400/80">
                          WhatsApp activo
                        </div>
                        <div className="mt-0.5 text-lg font-semibold text-white">
                          {clinic?.name ?? 'Tu clínica'} está atendiendo
                        </div>
                        <div className="mt-1 text-[12.5px] text-zinc-500">
                          Vinculado {formatUptime(connectedAt)}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(true)}>
                      <Power className="h-3.5 w-3.5" /> Desconectar
                    </Button>
                  </div>

                  {/* Numero + acciones */}
                  <div className="rounded-2xl border border-white/[0.06] bg-dark-900/60 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
                          <Phone className="h-3 w-3" /> Número conectado
                        </div>
                        <div className="mt-1.5 truncate font-mono text-xl font-semibold text-white">
                          {formatPhone(waStatus?.phone ?? config?.wa_phone)}
                        </div>
                      </div>
                      <button
                        onClick={copyPhone}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-dark-700 px-3 py-2 text-xs text-zinc-300 transition hover:border-white/[0.12] hover:text-white"
                      >
                        {copiedPhone ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-lime-400" /> Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copiar
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Stats rapidos */}
                  <div className="grid grid-cols-3 gap-3">
                    <MiniStat
                      icon={<Activity className="h-4 w-4 text-lime-400" />}
                      label="Estado sesión"
                      value="Saludable"
                    />
                    <MiniStat
                      icon={<Bot className="h-4 w-4 text-sky-300" />}
                      label="Asistente"
                      value={config?.assistant_name ?? '—'}
                    />
                    <MiniStat
                      icon={<Sparkles className="h-4 w-4 text-amber-300" />}
                      label="Motor IA"
                      value={config?.ai_provider === 'openai' ? 'OpenAI' : 'Claude'}
                    />
                  </div>
                </div>
              )}

              {/* ── ESTADO: QR LISTO ── */}
              {!connected && qrImage && (
                <div className="space-y-5">
                  <div className="text-center">
                    <div className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-amber-300 ring-1 ring-amber-500/30">
                      <QrCode className="h-3 w-3" /> Esperando escaneo
                    </div>
                    <h2 className="text-lg font-semibold text-white">Escanea con tu teléfono</h2>
                    <p className="mx-auto mt-1 max-w-md text-[13px] text-zinc-500">
                      Abre <span className="text-zinc-300">WhatsApp</span> →{' '}
                      <span className="text-zinc-300">Configuración</span> →{' '}
                      <span className="text-zinc-300">Dispositivos vinculados</span> →{' '}
                      <span className="text-zinc-300">Vincular un dispositivo</span>
                    </p>
                  </div>

                  {/* QR centrado con marco */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                      <div className="absolute -inset-1 animate-pulse rounded-2xl bg-gradient-to-r from-lime-500/30 via-amber-400/30 to-lime-500/30 blur" />
                      <div className="relative rounded-2xl border-2 border-amber-400/40 bg-white p-3">
                        <img src={qrImage} alt="QR WhatsApp" className="h-60 w-60" />
                      </div>
                      {/* Esquinas decorativas */}
                      <span className="absolute -left-2 -top-2 h-4 w-4 rounded-tl-lg border-l-2 border-t-2 border-amber-400" />
                      <span className="absolute -right-2 -top-2 h-4 w-4 rounded-tr-lg border-r-2 border-t-2 border-amber-400" />
                      <span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-bl-lg border-b-2 border-l-2 border-amber-400" />
                      <span className="absolute -bottom-2 -right-2 h-4 w-4 rounded-br-lg border-b-2 border-r-2 border-amber-400" />
                    </div>

                    {/* Countdown + status */}
                    <div className="flex items-center gap-3 text-[12.5px]">
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-dark-700 px-3 py-1 text-zinc-400">
                        <Clock className="h-3.5 w-3.5" />
                        Expira en <span className="font-mono text-zinc-200">{qrCountdown}s</span>
                      </div>
                      <div className="inline-flex items-center gap-2 text-zinc-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-lime-400" />
                        Esperando…
                      </div>
                    </div>

                    {/* Barra de progreso del countdown */}
                    <div className="h-1 w-60 overflow-hidden rounded-full bg-dark-600">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-lime-400 transition-all duration-1000"
                        style={{ width: `${(qrCountdown / QR_TTL_SEC) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-center gap-3">
                    <Button variant="secondary" size="sm" onClick={() => generateQR(false)}>
                      <RefreshCw className="h-3.5 w-3.5" /> Regenerar QR
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelQR}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {/* ── ESTADO: DESCONECTADO (sin QR aun) ── */}
              {!connected && !qrImage && (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-600 ring-1 ring-white/[0.06]">
                      <WifiOff className="h-7 w-7 text-zinc-500" />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                        Sin conexión
                      </div>
                      <div className="mt-0.5 text-lg font-semibold text-white">
                        Conecta tu WhatsApp para empezar
                      </div>
                      <div className="mt-1 text-[12.5px] text-zinc-500">
                        Tarda menos de 30 segundos. Solo necesitás tu teléfono.
                      </div>
                    </div>
                  </div>

                  {/* Pasos numerados */}
                  <div className="grid gap-3 md:grid-cols-3">
                    <Step
                      n={1}
                      title="Genera el QR"
                      desc="Tocá el botón verde abajo."
                      icon={<QrCode className="h-4 w-4" />}
                    />
                    <Step
                      n={2}
                      title="Abre WhatsApp"
                      desc="Ajustes → Dispositivos vinculados."
                      icon={<Smartphone className="h-4 w-4" />}
                    />
                    <Step
                      n={3}
                      title="Escanéalo"
                      desc="Vincular un dispositivo → listo."
                      icon={<CheckCircle2 className="h-4 w-4" />}
                    />
                  </div>

                  <div className="flex flex-col items-center gap-2 pt-2">
                    <Button onClick={() => generateQR(false)} loading={loading} className="w-full md:w-auto">
                      <QrCode className="h-4 w-4" /> Generar código QR
                    </Button>
                    <p className="text-[11.5px] text-zinc-600">
                      Encriptado de extremo a extremo · Sin acceso a tu cuenta personal
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* FAQ */}
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-zinc-400" />
              <h3 className="text-sm font-semibold text-white">Preguntas frecuentes</h3>
            </div>
            <div className="space-y-2">
              {faqs.map((f, i) => (
                <button
                  key={i}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full rounded-xl border border-white/[0.04] bg-dark-900/40 px-4 py-3 text-left transition hover:border-white/[0.08] hover:bg-dark-900/70"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-zinc-200">{f.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                    />
                  </div>
                  {openFaq === i && (
                    <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-500">{f.a}</p>
                  )}
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* ═══════════════ SIDEBAR (1/3) ═══════════════ */}
        <div className="space-y-5">
          {/* Preview asistente */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Bot className="h-4 w-4 text-lime-400" />
              <h3 className="text-sm font-semibold text-white">Tu asistente</h3>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl bg-dark-900/60 p-3 ring-1 ring-white/[0.04]">
                <div className="text-[10.5px] uppercase tracking-wider text-zinc-500">Nombre</div>
                <div className="mt-0.5 text-sm font-medium text-white">
                  {config?.assistant_name ?? '—'}
                </div>
              </div>
              <div className="rounded-xl bg-dark-900/60 p-3 ring-1 ring-white/[0.04]">
                <div className="text-[10.5px] uppercase tracking-wider text-zinc-500">Tono</div>
                <div className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium text-white">
                  {config?.tone === 'warm' && '🤗'}
                  {config?.tone === 'formal' && '🤝'}
                  {config?.tone === 'direct' && '⚡'}
                  <span className="capitalize">{config?.tone ?? '—'}</span>
                </div>
              </div>
              {config?.greeting && (
                <div className="rounded-xl bg-dark-900/60 p-3 ring-1 ring-white/[0.04]">
                  <div className="text-[10.5px] uppercase tracking-wider text-zinc-500">
                    Primer mensaje
                  </div>
                  <div className="mt-1 line-clamp-3 text-[12.5px] italic leading-relaxed text-zinc-300">
                    "{config.greeting}"
                  </div>
                </div>
              )}
              <a
                href="/configuracion"
                className="inline-flex items-center gap-1.5 text-[12px] text-lime-400 hover:text-lime-300"
              >
                <Cog className="h-3.5 w-3.5" /> Editar en Configuración
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </Card>

          {/* Beneficios cuando esta conectado / motivacion cuando no */}
          <Card className={connected ? '' : 'border-amber-500/20 bg-amber-500/[0.03]'}>
            <div className="mb-3 flex items-center gap-2">
              {connected ? (
                <>
                  <Zap className="h-4 w-4 text-amber-300" />
                  <h3 className="text-sm font-semibold text-white">El asistente está activo</h3>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  <h3 className="text-sm font-semibold text-white">Qué desbloqueás al conectar</h3>
                </>
              )}
            </div>
            <ul className="space-y-2.5 text-[12.5px] text-zinc-400">
              <Bullet>Respuestas automáticas 24/7 a pacientes</Bullet>
              <Bullet>Captura de leads con tratamiento de interés</Bullet>
              <Bullet>Agendamiento y recordatorios de citas</Bullet>
              <Bullet>Análisis visual de fotos dentales</Bullet>
              <Bullet>Escalación al doctor cuando es necesario</Bullet>
            </ul>
          </Card>

          {/* Privacidad */}
          <Card>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 ring-1 ring-sky-500/20">
                <Shield className="h-4 w-4 text-sky-300" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Conexión segura</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                  Sesión cifrada por clínica con el protocolo oficial de WhatsApp Web. Nadie del
                  equipo de Celura puede leer tus mensajes.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ═══════════════ MODAL: confirmar desconexion ═══════════════ */}
      <Modal
        open={confirmDisconnect}
        onClose={() => !disconnecting && setConfirmDisconnect(false)}
        title="Desconectar WhatsApp"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div className="text-[13px] text-zinc-300">
              <div className="font-semibold text-red-300">Esto borra todos los datos de WhatsApp</div>
              <div className="mt-1 text-zinc-400">
                Se eliminarán <strong className="text-zinc-200">conversaciones, leads, citas y
                follow-ups</strong> de esta clínica. Tu configuración del asistente se conserva.
              </div>
            </div>
          </div>

          <ul className="space-y-2 text-[12.5px] text-zinc-400">
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-zinc-500" />
              La sesión se cierra inmediatamente
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-zinc-500" />
              El asistente deja de responder a pacientes
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-zinc-500" />
              Para reactivarlo, generá un QR nuevo
            </li>
          </ul>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmDisconnect(false)} disabled={disconnecting}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={doDisconnect} loading={disconnecting}>
              <Power className="h-3.5 w-3.5" /> Sí, desconectar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Componentes auxiliares ───────────────────────────────────
function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-dark-900/40 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="text-[10.5px] uppercase tracking-wider text-zinc-500">{label}</span>
      </div>
      <div className="truncate text-sm font-semibold text-white">{value}</div>
    </div>
  )
}

function Step({
  n,
  title,
  desc,
  icon,
}: {
  n: number
  title: string
  desc: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-dark-900/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-lime-500/15 text-[11px] font-bold text-lime-400 ring-1 ring-lime-500/30">
          {n}
        </div>
        <div className="text-zinc-400">{icon}</div>
      </div>
      <div className="text-[13px] font-medium text-white">{title}</div>
      <div className="mt-0.5 text-[11.5px] text-zinc-500">{desc}</div>
    </div>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime-400" />
      <span>{children}</span>
    </li>
  )
}
