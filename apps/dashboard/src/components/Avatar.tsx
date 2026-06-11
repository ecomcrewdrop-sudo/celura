// ============================================================
//  Avatar · iniciales sobre fondo de color generado del nombre
//  Estable: el mismo nombre siempre devuelve el mismo color.
// ============================================================

import clsx from 'clsx'

interface Props {
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  ring?: boolean
  imageUrl?: string | null
  className?: string
}

// Paleta acotada para que las iniciales siempre se vean bien sobre el bg dark.
const PALETTE = [
  { bg: 'bg-lime-500/15',    text: 'text-lime-300',    ring: 'ring-lime-500/30' },
  { bg: 'bg-sky-500/15',     text: 'text-sky-300',     ring: 'ring-sky-500/30' },
  { bg: 'bg-violet-500/15',  text: 'text-violet-300',  ring: 'ring-violet-500/30' },
  { bg: 'bg-amber-500/15',   text: 'text-amber-300',   ring: 'ring-amber-500/30' },
  { bg: 'bg-rose-500/15',    text: 'text-rose-300',    ring: 'ring-rose-500/30' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-300', ring: 'ring-emerald-500/30' },
  { bg: 'bg-cyan-500/15',    text: 'text-cyan-300',    ring: 'ring-cyan-500/30' },
  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-300', ring: 'ring-fuchsia-500/30' },
]

function hashIndex(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.abs(h) % PALETTE.length
}

function initialsFrom(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '·'
  // Si arranca con "Dr/Dra/Doctor" lo saltamos para evitar iniciales tipo "DS"
  const cleaned = trimmed.replace(/^(dr|dra|doctor|doctora)\.?\s+/i, '').trim()
  const parts = (cleaned || trimmed).split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

const SIZE = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-2xl',
} as const

export default function Avatar({ name, size = 'md', ring, imageUrl, className }: Props) {
  const idx = hashIndex(name || '·')
  const palette = PALETTE[idx]!

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={clsx(
          'rounded-full object-cover',
          SIZE[size],
          ring && 'ring-2 ring-white/[0.08]',
          className,
        )}
      />
    )
  }

  return (
    <div
      className={clsx(
        'flex items-center justify-center rounded-full font-semibold uppercase tracking-tight select-none',
        SIZE[size],
        palette.bg,
        palette.text,
        ring && `ring-2 ${palette.ring}`,
        className,
      )}
      aria-label={name}
    >
      {initialsFrom(name)}
    </div>
  )
}
