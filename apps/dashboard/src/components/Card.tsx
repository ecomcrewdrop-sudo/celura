import clsx from 'clsx'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}

export default function Card({ children, className, hover, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'rounded-2xl border border-white/[0.06] bg-dark-800 p-5',
        hover && 'cursor-pointer transition-all duration-200 hover:border-white/[0.1] hover:bg-dark-700 hover:shadow-lg hover:shadow-black/25',
        className,
      )}
    >
      {children}
    </div>
  )
}
