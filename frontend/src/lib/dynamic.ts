import { createDynamicClient } from '@dynamic-labs-sdk/client'
import { addEvmExtension } from '@dynamic-labs-sdk/evm'

export const dynamicClient = createDynamicClient({
  environmentId: import.meta.env.DYNAMIC_ENVIRONMENT_ID,
  metadata: {
    name: 'HandOff',
  },
})

addEvmExtension()
