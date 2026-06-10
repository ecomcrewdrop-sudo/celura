import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  action?: ReactNode
}

export default function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="mb-8 flex items-end justify-between">
      <div>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[13px] text-zinc-500">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
