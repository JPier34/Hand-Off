import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider, createConfig, http, useConnect, useDisconnect } from 'wagmi'
import { baseSepolia, mainnet } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import './lib/dynamic' // side-effect: creates Dynamic client + adds EVM extension
import './index.css'
import App from './App.tsx'
import { dynamicWagmiConnector } from '@/lib/dynamic-wagmi-connector'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'

const dynamicConnector = dynamicWagmiConnector()

const wagmiConfig = createConfig({
  chains: [baseSepolia, mainnet],
  connectors: [dynamicConnector],
  transports: {
    [baseSepolia.id]: http(),
    [mainnet.id]: http(),
  },
})

const queryClient = new QueryClient()

/** Syncs Dynamic auth state → wagmi connection */
function DynamicWagmiSync() {
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <DynamicWagmiSync />
        <App />
      </WagmiProvider>
    </QueryClientProvider>
  </StrictMode>,
)
