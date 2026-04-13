import { useState, useEffect } from 'react'

export function CountdownTimer({ expiresAt }: { expiresAt: number }) {
  // Initialise via function to avoid calling Date.now() during render
  const [remaining, setRemaining] = useState(() => expiresAt - Date.now())

  useEffect(() => {
    const tick = () => setRemaining(expiresAt - Date.now())
    tick() // sync immediately on mount / expiresAt change
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  if (remaining <= 0) return <span className="text-red-400 text-sm font-mono">Expired</span>

  const hours = Math.floor(remaining / 3_600_000)
  const mins  = Math.floor((remaining % 3_600_000) / 60_000)
  const secs  = Math.floor((remaining % 60_000) / 1_000)

  return (
    <span className="text-hoff-text-tertiary text-sm font-mono">
      {hours}h {mins}m {secs}s
    </span>
  )
}
