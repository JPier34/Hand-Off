export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <div
      className={`animate-spin rounded-full border-b-2 border-current
        ${size === 'sm' ? 'h-4 w-4' : 'h-6 w-6'}`}
    />
  )
}
