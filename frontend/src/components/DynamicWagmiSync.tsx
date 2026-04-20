import { useEffect } from 'react'
import { useConnect, useDisconnect } from 'wagmi'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'
import { DYNAMIC_ENABLED } from '@/lib/dynamic-config'

/** Syncs Dynamic auth state → wagmi connection */
export function DynamicWagmiSync() {
  const { isAuthenticated } = useDynamicAuth()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  useEffect(() => {
    if (!DYNAMIC_ENABLED) return

    const connector = connectors.find(c => c.id === 'dynamic')
    if (!connector) return

    if (isAuthenticated) {
      connect({ connector })
    } else {
      disconnect()
    }
  }, [isAuthenticated, connect, connectors, disconnect])

  if (!DYNAMIC_ENABLED) return null

  return null
}
