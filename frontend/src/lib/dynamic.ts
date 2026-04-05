// Dynamic.xyz — framework-agnostic JavaScript SDK
//
// Package: @dynamic-labs-sdk/client  ← JS SDK (not the legacy React-only SDK)
// Package: @dynamic-labs-sdk/evm     ← EVM extension (viem bridge)
//
// This is the Dynamic JS SDK prize track integration. All auth and wallet calls
// (sendEmailOTP, verifyOTP, createWaasWalletAccounts, connectAndVerifyWithWalletProvider,
// getWalletAccounts, switchActiveNetwork) are raw JavaScript SDK calls, not React hooks.
// The SDK is used inside React but it has no React dependency — it is purely JS.
//
// See useDynamicAuth.ts for the full auth flow:
//   email OTP → embedded wallet creation (WaaS) → wagmi bridge → transaction signing
import { createDynamicClient } from '@dynamic-labs-sdk/client'
import { addEvmExtension } from '@dynamic-labs-sdk/evm'

export const dynamicClient = createDynamicClient({
  environmentId: import.meta.env.DYNAMIC_ENVIRONMENT_ID,
  metadata: {
    name: 'HandOff',
  },
})

addEvmExtension()
