// ⚠️  MUST be the very first import — runs addEvmExtension() + createDynamicClient()
// before any other module in the dependency graph calls Dynamic SDK functions.
// App.tsx → useDynamicAuth.ts has module-level waitForClientInitialized() calls;
// if dynamic.ts hasn't been evaluated first, they throw ClientNotFoundError.
import '@/lib/dynamic'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { sepolia, mainnet } from 'wagmi/chains'
import { getTargetChainId, getRpcUrl, CHAIN_IDS } from '@/lib/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { dynamicWagmiConnector } from '@/lib/dynamic-wagmi-connector'
import { DynamicWagmiSync } from '@/components/DynamicWagmiSync'
import { MOCK_MODE, resetMock, setMockDeal } from '@/lib/mock'
import { TOKENS } from '@/lib/tokens'
import { DYNAMIC_ENABLED } from '@/lib/dynamic-config'
import { initDynamic } from '@/lib/dynamic'

const dynamicConnector = dynamicWagmiConnector()

const isMainnet = getTargetChainId() === CHAIN_IDS.MAINNET
const rpcUrl = getRpcUrl()

const wagmiConfig = createConfig({
  chains: isMainnet ? [mainnet, sepolia] : [sepolia, mainnet],
  connectors: DYNAMIC_ENABLED ? [dynamicConnector] : [],
  transports: {
    [sepolia.id]: http(isMainnet ? undefined : rpcUrl),
    [mainnet.id]: http(isMainnet ? rpcUrl : undefined),
  },
})

const queryClient = new QueryClient()

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

if (MOCK_MODE && typeof window !== 'undefined') {
  const api = {
    setDeal: (dealId: number, updates: Parameters<typeof setMockDeal>[1]) => {
      setMockDeal(BigInt(dealId), updates)
    },
    reset: (dealId?: number) => {
      resetMock(dealId !== undefined ? BigInt(dealId) : undefined)
    },
    TOKENS,
  }
  ;(window as unknown as { __handoffMock?: typeof api }).__handoffMock = api
}
