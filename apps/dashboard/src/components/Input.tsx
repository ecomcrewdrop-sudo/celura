import clsx from 'clsx'
import type { InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export default function Input({ label, error, className, id, ...rest }: Props) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-zinc-300">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={clsx(
          'w-full rounded-lg border bg-dark-700 px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors',
          error
            ? 'border-red-500/50 focus:border-red-500'
            : 'border-dark-500 focus:border-lime-500/50',
          className,
        )}
        {...rest}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
