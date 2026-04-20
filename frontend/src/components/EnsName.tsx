import { useState, useEffect } from 'react'
import { resolveEnsAddress } from '@/lib/ens'

interface EnsNameProps {
  address: `0x${string}`
  /** On-chain stored ENS name — shown immediately without network lookup when provided. */
  hint?: string
  className?: string
}

/**
 * Displays an address as its ENS name (or short hex fallback).
 *
 * Resolution priority:
 * 1. `hint` — on-chain stored ENS name (e.g. `sellerEns` from the escrow contract)
 * 2. Reverse ENS resolution via mainnet RPC (async)
 * 3. Truncated hex address as fallback
 */
export function EnsName({ address, hint, className = '' }: EnsNameProps) {
  const [resolved, setResolved] = useState<string | null>(null)

  useEffect(() => {
    // If hint is set, skip the RPC call entirely
    if (hint) return
    let cancelled = false
    resolveEnsAddress(address).then((name) => {
      if (!cancelled) setResolved(name)
    })
    return () => { cancelled = true }
  }, [address, hint])

  const display = hint || resolved || `${address.slice(0, 6)}...${address.slice(-4)}`

  return <span className={className}>{display}</span>
}
