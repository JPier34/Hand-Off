import { useState, useCallback } from 'react'
import { getWalletAccounts, switchActiveNetwork, addNetwork } from '@dynamic-labs-sdk/client'
import { getWalletProviderFromWalletAccount } from '@dynamic-labs-sdk/client/core'
import { dynamicClient } from '@/lib/dynamic'
import { createWalletClient, custom, encodeFunctionData } from 'viem'
import { baseSepolia } from 'viem/chains'
import type { Abi, Address } from 'viem'

const BASE_SEPOLIA_NETWORK_ID = String(baseSepolia.id) // "84532"

interface WriteContractParams {
  address: Address
  abi: Abi
  functionName: string
  args?: unknown[]
  value?: bigint
}

interface WriteState {
  data: `0x${string}` | undefined
  isPending: boolean
  isError: boolean
  error: Error | null
}

const IDLE: WriteState = {
  data: undefined,
  isPending: false,
  isError: false,
  error: null,
}

/**
 * Drop-in replacement for wagmi's useWriteContract that uses
 * Dynamic SDK's wallet provider directly.
 *
 * Bypasses Dynamic's createWalletClientForWalletAccount (which calls
 * getActiveNetworkData and triggers a broken chrome.runtime.sendMessage
 * in some wallet extensions). Instead, we get the EIP-1193 provider
 * from Dynamic and create the viem client ourselves with a hardcoded chain.
 *
 * Works with: browser extensions (Rainbow, MetaMask), embedded wallets (email/social).
 */
export function useDynamicWriteContract() {
  const [state, setState] = useState<WriteState>(IDLE)

  const writeContract = useCallback(async (params: WriteContractParams) => {
    setState({ ...IDLE, isPending: true })

    try {
      const accounts = getWalletAccounts()
      const walletAccount = accounts?.[0]
      if (!walletAccount) throw new Error('No wallet connected')

      // Get the EIP-1193 provider from Dynamic's wallet provider registry
      // This is the same provider createWalletClientForWalletAccount uses internally,
      // but we skip the getActiveNetworkData() call that breaks extension messaging.
      const walletProvider = getWalletProviderFromWalletAccount({ walletAccount }, dynamicClient)

      // The provider must have a request method (EIP-1193)
      const provider = walletProvider as { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
      if (!provider.request) throw new Error('Wallet provider does not support EIP-1193 requests')

      // Switch to Base Sepolia via Dynamic SDK (not via extension's broken request API)
      try {
        await switchActiveNetwork({ walletAccount, networkId: BASE_SEPOLIA_NETWORK_ID })
      } catch (switchErr: unknown) {
        // If network not added, add it first then switch
        try {
          await addNetwork({
            walletAccount,
            networkData: {
              networkId: BASE_SEPOLIA_NETWORK_ID,
              chain: 'EVM',
              name: 'Base Sepolia',
              displayName: 'Base Sepolia',
              iconUrl: '',
              nativeCurrency: { ...baseSepolia.nativeCurrency },
              rpcUrls: { http: [...baseSepolia.rpcUrls.default.http] },
              blockExplorerUrls: [baseSepolia.blockExplorers.default.url],
              testnet: true,
            },
          })
          await switchActiveNetwork({ walletAccount, networkId: BASE_SEPOLIA_NETWORK_ID })
        } catch {
          console.warn('[useDynamicWrite] Could not switch to Base Sepolia:', switchErr)
        }
      }

      // Re-fetch provider after chain switch (provider state may have changed)
      const freshProvider = getWalletProviderFromWalletAccount({ walletAccount }, dynamicClient)
      const txProvider = freshProvider as { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
      if (!txProvider.request) throw new Error('Wallet provider lost after chain switch')

      // Create viem wallet client — use JSON-RPC account (not local account)
      // so signing is delegated to the wallet extension / embedded wallet
      const walletClient = createWalletClient({
        account: walletAccount.address as Address,
        chain: baseSepolia,
        transport: custom(txProvider as Parameters<typeof custom>[0]),
      })

      const data = encodeFunctionData({
        abi: params.abi,
        functionName: params.functionName,
        args: params.args ?? [],
      })

      const hash = await walletClient.sendTransaction({
        to: params.address,
        data,
        value: params.value ?? 0n,
      })

      setState({ data: hash, isPending: false, isError: false, error: null })
    } catch (err) {
      console.error('[useDynamicWrite] Transaction failed:', err)
      setState({
        data: undefined,
        isPending: false,
        isError: true,
        error: err instanceof Error ? err : new Error(String(err)),
      })
    }
  }, [])

  return {
    writeContract,
    data: state.data,
    isPending: state.isPending,
    isError: state.isError,
    error: state.error,
  }
}
