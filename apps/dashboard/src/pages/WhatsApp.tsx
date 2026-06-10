import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useClinic } from '@/hooks/useClinic'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Button from '@/components/Button'
import { Smartphone, Wifi, WifiOff, RefreshCw } from 'lucide-react'

interface WAStatus {
  status: string; connected: boolean; phone: string | null; qr_available: boolean
}
interface QRResponse {
  status: string; qr_image?: string; phone?: string
}

export default function WhatsApp() {
  const { config, refresh } = useClinic()
  const [waStatus, setWaStatus] = useState<WAStatus | null>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [polling, setPolling] = useState(false)

  const checkStatus = useCallback(async () => {
    const r = await api.get<WAStatus>('/api/whatsapp/status')
    if (r.data) setWaStatus(r.data)
  }, [])

  useEffect(() => { checkStatus() }, [checkStatus])

  const generateQR = async () => {
    setLoading(true)
    setQrImage(null)
    const r = await api.get<QRResponse>('/api/whatsapp/qr')
    if (r.data?.qr_image) {
      setQrImage(r.data.qr_image)
      // Poll status every 3s until connected or 2 min timeout
      setPolling(true)
      let tries = 0
      const interval = setInterval(async () => {
        tries++
        const s = await api.get<WAStatus>('/api/whatsapp/status')
        if (s.data?.connected) {
          clearInterval(interval)
          setPolling(false)
          setQrImage(null)
          setWaStatus(s.data)
          refresh()
        }
        if (tries > 40) { clearInterval(interval); setPolling(false) }
      }, 3000)
    }
    setLoading(false)
  }

  const disconnect = async () => {
    setDisconnecting(true)
    await api.post('/api/whatsapp/disconnect', {})
    setDisconnecting(false)
    setWaStatus({ status: 'disconnected', connected: false, phone: null, qr_available: false })
    setQrImage(null)
    refresh()
  }

  const connected = waStatus?.connected

  return (
    <div className="animate-fade-in">
      <PageHeader title="WhatsApp" subtitle="Conecta tu número para empezar a atender pacientes" />

      <div className="mx-auto max-w-lg">
        <Card className="text-center">
          {/* Status icon */}
          <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl ${
            connected ? 'bg-lime-500/20' : 'bg-dark-600'
          }`}>
            {connected ? (
              <Wifi className="h-10 w-10 text-lime-400" />
            ) : (
              <WifiOff className="h-10 w-10 text-zinc-500" />
            )}
          </div>

          {connected ? (
            <>
              <div className="mb-1 inline-flex items-center gap-2">
                <div className="h-2.5 w-2.5 animate-pulse-lime rounded-full bg-lime-400" />
                <span className="text-sm font-semibold text-lime-400">Conectado</span>
              </div>
              <p className="mb-6 text-sm text-zinc-400">
                Número: <span className="text-white">{waStatus?.phone ?? config?.wa_phone ?? '—'}</span>
              </p>
              <Button variant="danger" onClick={disconnect} loading={disconnecting}>
                <WifiOff className="h-4 w-4" /> Desconectar
              </Button>
            </>
          ) : qrImage ? (
            <>
              <p className="mb-4 text-sm text-zinc-400">
                Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular dispositivo
              </p>
              <div className="mx-auto mb-4 inline-block rounded-xl border-2 border-lime-500/30 bg-white p-2">
                <img src={qrImage} alt="QR WhatsApp" className="h-64 w-64" />
              </div>
              {polling && (
                <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" />
                  Esperando que escanees...
                </div>
              )}
              <Button variant="ghost" onClick={generateQR} className="mt-4">
                <RefreshCw className="h-4 w-4" /> Regenerar QR
              </Button>
            </>
          ) : (
            <>
              <h2 className="mb-2 text-lg font-semibold text-white">WhatsApp desconectado</h2>
              <p className="mb-6 text-sm text-zinc-400">
                Genera un código QR y escanéalo con tu teléfono para conectar. Los pacientes que
                escriban serán atendidos automáticamente por el asistente.
              </p>
              <Button onClick={generateQR} loading={loading}>
                <Smartphone className="h-4 w-4" /> Generar código QR
              </Button>
            </>
          )}
        </Card>

        {/* Info cards */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Card>
            <p className="text-xs text-zinc-500">Estado</p>
            <p className="mt-1 text-sm font-medium text-white">{waStatus?.status ?? '...'}</p>
          </Card>
          <Card>
            <p className="text-xs text-zinc-500">Asistente</p>
            <p className="mt-1 text-sm font-medium text-lime-400">{config?.assistant_name ?? '...'}</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
