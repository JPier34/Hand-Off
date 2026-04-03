export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-hoff-surface border border-hoff-elevated rounded-xl p-5 ${className}`}>
      {children}
    </div>
  )
}
