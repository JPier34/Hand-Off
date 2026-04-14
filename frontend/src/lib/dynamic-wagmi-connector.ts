import { createConnector } from 'wagmi'
import { getWalletAccounts, onEvent, waitForClientInitialized } from '@dynamic-labs-sdk/client'
import { sepolia } from 'wagmi/chains'
import type { Address } from 'viem'
import { DYNAMIC_ENABLED } from '@/lib/dynamic-config'

/**
 * Custom wagmi connector that bridges Dynamic SDK wallet accounts to wagmi.
 *
 * Provides account state and chain info to wagmi (useAccount, useReadContract).
 * Writes go through useDynamicWriteContract which uses Dynamic's viem client directly.
 */
export function dynamicWagmiConnector() {
  if (!DYNAMIC_ENABLED) {
    return createConnector((() => ({
      id: 'dynamic-disabled',
      name: 'Dynamic Disabled',
      type: 'dynamic' as const,
      async setup() {},
      async connect() { throw new Error('Dynamic is disabled in this environment') },
      async disconnect() {},
      async getAccounts() { return [] as readonly Address[] },
      async getChainId() { return sepolia.id },
      async getProvider() { return {} as unknown },
      async isAuthorized() { return false },
      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {},
    })) as never)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createConnector(((config: any) => {

    return {
      id: 'dynamic',
      name: 'Dynamic',
      type: 'dynamic' as const,

      async setup() {
        // Defer onEvent until the Dynamic client is fully initialized.
        // wagmi calls setup() during createConfig() — before waitForClientInitialized()
        // resolves — so calling onEvent() here directly throws ClientNotFoundError.
        waitForClientInitialized().then(() => {
          onEvent({
            event: 'walletAccountsChanged',
            listener: ({ walletAccounts }: { walletAccounts: { address?: string }[] }) => {
              if (walletAccounts && walletAccounts.length > 0 && walletAccounts[0].address) {
                config.emitter.emit('change', {
                  accounts: [walletAccounts[0].address as Address],
                })
              } else {
                config.emitter.emit('disconnect')
              }
            },
          })
        }).catch(() => { /* client init failed — connector stays idle */ })
      },

      async connect() {
        const accounts = getWalletAccounts()
        const walletAccount = accounts?.[0]
        if (!walletAccount) throw new Error('No Dynamic wallet connected')

        const addr = walletAccount.address as Address
        const chainId = sepolia.id as number

        config.emitter.emit('connect', { accounts: [addr] as readonly Address[], chainId })
        return { accounts: [addr] as readonly Address[], chainId }
      },

      async disconnect() {
        config.emitter.emit('disconnect')
      },

      async getAccounts() {
        const accounts = getWalletAccounts()
        if (!accounts || accounts.length === 0) return []
        return [accounts[0].address as Address]
      },

      async getChainId() {
        return sepolia.id
      },

      async getProvider() {
        // Return a minimal provider — reads go through wagmi's transports,
        // writes go through useDynamicWriteContract (bypasses this).
        return {} as unknown
      },

      async isAuthorized() {
        try {
          const accounts = getWalletAccounts()
          return !!accounts && accounts.length > 0
        } catch {
          // Client not yet initialized — report not authorized; wagmi will retry
          return false
        }
      },

      onAccountsChanged(accounts: string[]) {
        if (accounts.length > 0) {
          config.emitter.emit('change', {
            accounts: accounts as Address[],
          })
        } else {
          config.emitter.emit('disconnect')
        }
      },

      onChainChanged(chainId: string) {
        config.emitter.emit('change', {
          chainId: Number(chainId),
        })
      },

      onDisconnect() {
        config.emitter.emit('disconnect')
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any)
}
