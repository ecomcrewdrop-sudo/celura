import clsx from 'clsx'

const variants: Record<string, string> = {
  lime: 'bg-lime-500/15 text-lime-400 border-lime-500/30',
  blue: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  red: 'bg-red-500/15 text-red-400 border-red-500/30',
  zinc: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}

const stageColors: Record<string, string> = {
  new: 'lime',
  contacted: 'blue',
  warm: 'amber',
  interested: 'purple',
  scheduled: 'emerald',
  attended: 'emerald',
  recurring: 'lime',
  lost: 'red',
}

const urgencyColors: Record<string, string> = {
  low: 'zinc',
  medium: 'amber',
  high: 'red',
  emergency: 'red',
}

interface Props {
  children: React.ReactNode
  variant?: string
  stage?: string
  urgency?: string
}

export default function Badge({ children, variant, stage, urgency }: Props) {
  const color = variant ?? (stage ? stageColors[stage] : urgency ? urgencyColors[urgency] : 'zinc') ?? 'zinc'
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variants[color],
      )}
    >
      {children}
    </span>
  )
}
