import { useEffect, useState } from 'react'
import { isAddress } from 'viem'
import type { Address } from 'viem'
import { resolveEnsName } from '@/lib/ens'

interface EnsInputProps {
  value: string
  onChange: (value: string) => void
  /** Called when resolution completes: address if found, null if not resolvable */
  onResolved: (address: Address | null) => void
  placeholder?: string
  className?: string
  label?: string
  hint?: string
}

/**
 * Controlled input that accepts either a raw address or an ENS name.
 * - If input ends with .eth: resolves via mainnet and reports back via onResolved
 * - If input is a valid 0x address: calls onResolved immediately
 * - Otherwise: calls onResolved(null)
 */
export function EnsInput({
  value,
  onChange,
  onResolved,
  placeholder = '0x... or name.eth',
  className = '',
  label,
  hint,
}: EnsInputProps) {
  const [resolvedAddress, setResolvedAddress] = useState<Address | null>(null)
  const [isResolving, setIsResolving]         = useState(false)
  const [resolveFailed, setResolveFailed]     = useState(false)

  const isEns = value.endsWith('.eth')

  useEffect(() => {
    setResolvedAddress(null)
    setResolveFailed(false)

    // Raw address — resolve immediately
    if (isAddress(value)) {
      onResolved(value as Address)
      return
    }

    // ENS name
    if (isEns && value.length > 4) {
      let cancelled = false
      setIsResolving(true)
      resolveEnsName(value).then((addr) => {
        if (cancelled) return
        setIsResolving(false)
        setResolvedAddress(addr)
        setResolveFailed(!addr)
        onResolved(addr)
      })
      return () => { cancelled = true }
    }

    // Empty or partial input
    onResolved(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className="space-y-1">
      {label && (
        <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">
          {label}
        </p>
      )}
      {hint && (
        <p className="text-xs text-hoff-text-tertiary">{hint}</p>
      )}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className={`w-full bg-transparent text-hoff-text-primary text-sm placeholder:text-hoff-text-tertiary focus:outline-none ${className}`}
      />

      {/* Resolution feedback */}
      {isEns && isResolving && (
        <p className="text-xs text-hoff-text-tertiary">Resolving…</p>
      )}
      {isEns && !isResolving && resolvedAddress && (
        <p className="text-xs font-mono break-all text-green-400">
          ✓ {resolvedAddress}
        </p>
      )}
      {isEns && !isResolving && resolveFailed && value.length > 4 && (
        <p className="text-xs text-red-400">Could not resolve ENS name</p>
      )}
    </div>
  )
}
