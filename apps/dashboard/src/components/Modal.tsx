import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function Modal({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-sheet-up safe-pb relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/[0.08] bg-dark-800 shadow-2xl shadow-black/40 sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4 sm:border-0 sm:px-6 sm:py-5">
          <h2 className="text-base font-semibold text-white sm:text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="touch-target -mr-1.5 flex items-center justify-center rounded-xl p-2 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:pb-6 sm:pt-2">
          {children}
        </div>
      </div>
    </div>
  )
}
