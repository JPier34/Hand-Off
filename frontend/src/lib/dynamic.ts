import { createDynamicClient } from '@dynamic-labs-sdk/client'
import { addEvmExtension } from '@dynamic-labs-sdk/evm'
import { DYNAMIC_ENABLED, DYNAMIC_ENVIRONMENT_ID } from '@/lib/dynamic-config'

export const dynamicClient = DYNAMIC_ENABLED
  ? createDynamicClient({
      environmentId: DYNAMIC_ENVIRONMENT_ID,
      metadata: {
        name: 'HandOff',
      },
    })
  : null

export function initDynamic() {
  if (!DYNAMIC_ENABLED) return
  addEvmExtension()
}
