interface InputProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  error?: string
  type?: string
}

export function Input({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  type = 'text',
}: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="block text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">
        {label}
      </label>
      {hint && <p className="text-xs text-hoff-text-tertiary">{hint}</p>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-transparent text-hoff-text-primary text-sm
          placeholder:text-hoff-text-tertiary/50
          focus:outline-none
          ${error ? 'border-b border-hoff-err pb-1' : ''}`}
      />
      {error && <p className="text-xs text-hoff-err">{error}</p>}
    </div>
  )
}
