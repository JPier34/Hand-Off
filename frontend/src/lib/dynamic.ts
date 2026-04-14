import { createDynamicClient } from '@dynamic-labs-sdk/client'
import { addEvmExtension } from '@dynamic-labs-sdk/evm'
import { DYNAMIC_ENABLED, DYNAMIC_ENVIRONMENT_ID } from '@/lib/dynamic-config'

console.log('[dynamic.ts] module evaluated — DYNAMIC_ENABLED:', DYNAMIC_ENABLED)

// addEvmExtension MUST be called before createDynamicClient — it registers
// the EVM connector in the SDK's global registry before the client boots.
if (DYNAMIC_ENABLED) {
  console.log('[dynamic.ts] calling addEvmExtension()')
  addEvmExtension()
  console.log('[dynamic.ts] addEvmExtension() done')
}

export const dynamicClient = DYNAMIC_ENABLED
  ? (() => {
      console.log('[dynamic.ts] calling createDynamicClient()')
      const c = createDynamicClient({
        environmentId: DYNAMIC_ENVIRONMENT_ID,
        metadata: { name: 'HandOff' },
      })
      console.log('[dynamic.ts] createDynamicClient() done')
      return c
    })()
  : null

// Kept for import compatibility — no longer needed as a call site.
export function initDynamic() {}
