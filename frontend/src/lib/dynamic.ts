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
