import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  children: ReactNode
  loading?: boolean
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  loading,
  className,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm',
        variant === 'primary' && 'bg-lime-500 text-dark-900 hover:bg-lime-400 active:bg-lime-600',
        variant === 'secondary' && 'border border-dark-500 bg-dark-700 text-zinc-200 hover:border-dark-400 hover:bg-dark-600',
        variant === 'danger' && 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
        variant === 'ghost' && 'text-zinc-400 hover:bg-dark-700 hover:text-white',
        className,
      )}
      {...rest}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
