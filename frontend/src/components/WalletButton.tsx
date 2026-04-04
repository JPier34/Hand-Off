import { useState, useRef, useEffect } from 'react'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'

export function WalletButton() {
  const { isAuthenticated, walletAddress, login, disconnect } = useDynamicAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (!isAuthenticated || !walletAddress) {
    return (
      <button
        onClick={login}
        className="h-9 px-4 rounded-xl bg-hoff-accent text-hoff-bg text-xs font-bold hover:bg-hoff-accent-hover transition-colors"
      >
        Connect
      </button>
    )
  }

  const short = `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="h-9 px-3 rounded-xl bg-hoff-elevated border border-hoff-brand text-xs font-mono text-hoff-text-primary hover:border-hoff-accent/40 transition-colors flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-hoff-accent shrink-0" />
        {short}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-hoff-surface border border-hoff-brand rounded-xl shadow-lg py-1 min-w-[160px] z-50">
          <div className="px-3 py-2 border-b border-hoff-brand">
            <p className="text-[10px] text-hoff-text-tertiary uppercase tracking-wider">Connected</p>
            <p className="text-xs font-mono text-hoff-text-secondary mt-0.5">{short}</p>
          </div>
          <button
            onClick={() => { disconnect(); setOpen(false) }}
            className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-900/20 transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
