import { useState, useEffect, useRef } from 'react'

interface DropdownOption {
  label: string
  value: string
}

interface DropdownProps {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  className?: string
  'data-testid'?: string
}

export function Dropdown({ value, onChange, options, className = '', 'data-testid': testId }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className={`relative ${className}`} data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="h-9 w-full px-3 rounded-xl bg-hoff-elevated border border-hoff-brand text-hoff-text-secondary font-medium text-sm cursor-pointer focus:outline-none focus:border-hoff-accent/60 transition-colors flex items-center justify-between gap-2"
      >
        <span>{selected?.label ?? value}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`text-hoff-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-hoff-surface border border-hoff-brand rounded-xl shadow-lg overflow-hidden z-10">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                opt.value === value
                  ? 'text-hoff-accent font-medium bg-hoff-elevated'
                  : 'text-hoff-text-secondary hover:bg-hoff-elevated'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
