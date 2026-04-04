import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

// Wagmi config — chains only, Dynamic injects the connector at runtime
const wagmiConfig = createConfig({
  chains: [baseSepolia],
  transports: { [baseSepolia.id]: http() },
})

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DynamicContextProvider
      settings={{
        environmentId: import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <DynamicWagmiConnector>
            <App />
          </DynamicWagmiConnector>
        </WagmiProvider>
      </QueryClientProvider>
    </DynamicContextProvider>
  </StrictMode>,
)
