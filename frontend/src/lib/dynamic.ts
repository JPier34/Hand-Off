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
import { DYNAMIC_ENABLED, DYNAMIC_ENVIRONMENT_ID } from '@/lib/dynamic-config'

// SDK v0.23+: addEvmExtension(client) calls getDefaultClient() as its default
// parameter — the client MUST exist before addEvmExtension is called.
// Correct order: createDynamicClient() first, then addEvmExtension(client).
export const dynamicClient = DYNAMIC_ENABLED
  ? createDynamicClient({
      environmentId: DYNAMIC_ENVIRONMENT_ID,
      metadata: { name: 'HandOff' },
    })
  : null

if (DYNAMIC_ENABLED && dynamicClient) {
  addEvmExtension(dynamicClient)
}

// Kept for import compatibility — no longer needed as a call site.
export function initDynamic() {}
