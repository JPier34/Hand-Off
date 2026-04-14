import { createDynamicClient } from '@dynamic-labs-sdk/client'
import { addEvmExtension } from '@dynamic-labs-sdk/evm'
import { DYNAMIC_ENABLED, DYNAMIC_ENVIRONMENT_ID } from '@/lib/dynamic-config'

// addEvmExtension MUST be called before createDynamicClient — it registers
// the EVM connector in the SDK's global registry before the client boots.
if (DYNAMIC_ENABLED) {
  addEvmExtension()
}

export const dynamicClient = DYNAMIC_ENABLED
  ? createDynamicClient({
      environmentId: DYNAMIC_ENVIRONMENT_ID,
      metadata: { name: 'HandOff' },
    })
  : null

// Kept for import compatibility — no longer needed as a call site.
export function initDynamic() {}
