import { useEffect } from 'react'
import { useConnect, useDisconnect } from 'wagmi'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'

/** Syncs Dynamic auth state → wagmi connection */
export function DynamicWagmiSync() {
  const { isAuthenticated } = useDynamicAuth()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  useEffect(() => {
    const connector = connectors.find(c => c.id === 'dynamic')
    if (!connector) return

    if (isAuthenticated) {
      connect({ connector })
    } else {
      disconnect()
    }
  }, [isAuthenticated, connect, connectors, disconnect])

  return null
}
