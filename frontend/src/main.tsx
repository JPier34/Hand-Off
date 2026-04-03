import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// TODO: swap these in once @dynamic-labs-sdk packages are installed:
// import { DynamicContextProvider } from '@dynamic-labs-sdk/client'
// import { EthereumWalletConnectors } from '@dynamic-labs-sdk/evm'
// import { DynamicWagmiConnector } from '@dynamic-labs-sdk/wagmi-connector'
// Then replace wagmiConfig with the one from DynamicWagmiConnector and wrap with DynamicContextProvider:
// <DynamicContextProvider settings={{ environmentId: import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID, walletConnectors: [EthereumWalletConnectors] }}>
//   <WagmiProvider config={dynamicWagmiConfig}>
//     ...
//   </WagmiProvider>
// </DynamicContextProvider>
import './index.css'
import App from './App.tsx'

const wagmiConfig = createConfig({
  chains: [baseSepolia],
  transports: { [baseSepolia.id]: http() },
})

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
