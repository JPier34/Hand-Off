import { useState, useEffect } from 'react'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http('https://ethereum-rpc.publicnode.com'),
})

const cache = new Map<string, string | null>()

interface EnsNameProps {
  address: `0x${string}`
  className?: string
}

export function EnsName({ address, className = '' }: EnsNameProps) {
  const [ensName, setEnsName] = useState<string | null>(cache.get(address) ?? null)

  useEffect(() => {
    if (cache.has(address)) {
      setEnsName(cache.get(address)!)
      return
    }
    let cancelled = false
    mainnetClient.getEnsName({ address }).then((name) => {
      if (!cancelled) {
        cache.set(address, name)
        setEnsName(name)
      }
    }).catch(() => {
      if (!cancelled) cache.set(address, null)
    })
    return () => { cancelled = true }
  }, [address])

  const display = ensName ?? `${address.slice(0, 6)}...${address.slice(-4)}`

  return <span className={className}>{display}</span>
}
