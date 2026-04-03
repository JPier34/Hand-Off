import { Spinner } from './Spinner'

interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'ghost' | 'danger'
  fullWidth?: boolean
  type?: 'button' | 'submit'
}

export function Button({
  children,
  onClick,
  disabled,
  loading,
  variant = 'primary',
  fullWidth = false,
  type = 'button',
}: ButtonProps) {
  const base =
    'h-12 px-6 font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-40'
  const variants = {
    primary: 'bg-hoff-accent text-white hover:bg-hoff-accent-hover rounded-2xl',
    ghost:   'border border-hoff-brand text-hoff-text-secondary hover:bg-hoff-surface hover:text-hoff-text-primary rounded-xl',
    danger:  'bg-red-900/40 text-red-400 border border-red-800 hover:bg-red-900/60 rounded-xl',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${fullWidth ? 'w-full' : ''}`}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}
