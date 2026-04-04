import { createConnector } from 'wagmi'
import { getWalletAccounts, onEvent } from '@dynamic-labs-sdk/client'
import { baseSepolia } from 'wagmi/chains'
import type { Address } from 'viem'

/**
 * Custom wagmi connector that bridges Dynamic SDK wallet accounts to wagmi.
 *
 * Provides account state and chain info to wagmi (useAccount, useReadContract).
 * Writes go through useDynamicWriteContract which uses Dynamic's viem client directly.
 */
export function dynamicWagmiConnector() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createConnector(((config: any) => {

    return {
      id: 'dynamic',
      name: 'Dynamic',
      type: 'dynamic' as const,

      async setup() {
        // Listen for Dynamic wallet changes and emit wagmi events
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
      },

      async connect() {
        const accounts = getWalletAccounts()
        const walletAccount = accounts?.[0]
        if (!walletAccount) throw new Error('No Dynamic wallet connected')

        const addr = walletAccount.address as Address
        const chainId = baseSepolia.id as number

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
        return baseSepolia.id
      },

      async getProvider() {
        // Return a minimal provider — reads go through wagmi's transports,
        // writes go through useDynamicWriteContract (bypasses this).
        return {} as unknown
      },

      async isAuthorized() {
        const accounts = getWalletAccounts()
        return !!accounts && accounts.length > 0
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
