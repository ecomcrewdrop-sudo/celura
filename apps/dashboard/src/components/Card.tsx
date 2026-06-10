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
        'rounded-xl border border-dark-600 bg-dark-800 p-5',
        hover && 'cursor-pointer transition-all duration-150 hover:border-dark-400 hover:bg-dark-700',
        className,
      )}
    >
      {children}
    </div>
  )
}
