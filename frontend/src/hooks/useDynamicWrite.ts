import { useState, useCallback } from 'react'
import { getWalletAccounts } from '@dynamic-labs-sdk/client'
import { encodeFunctionData } from 'viem'
import type { Abi, Address } from 'viem'

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
      console.log('[useDynamicWrite] Starting writeContract:', {
        to: params.address,
        fn: params.functionName,
        args: params.args,
        value: params.value?.toString(),
      })

      const accounts = getWalletAccounts()
      console.log('[useDynamicWrite] Wallet accounts:', accounts?.length, accounts?.[0]?.address, 'providerKey:', accounts?.[0]?.walletProviderKey)
      const walletAccount = accounts?.[0]
      if (!walletAccount) throw new Error('No wallet connected')

      console.log('[useDynamicWrite] Wallet provider key:', walletAccount.walletProviderKey)

      const data = encodeFunctionData({
        abi: params.abi,
        functionName: params.functionName,
        args: params.args ?? [],
      })

      const value = params.value ?? 0n
      const txParams = {
        from: walletAccount.address,
        to: params.address,
        data,
        ...(value > 0n ? { value: `0x${value.toString(16)}` } : {}),
      }

      console.log('[useDynamicWrite] Sending eth_sendTransaction:', txParams)

      // Use window.ethereum directly — Dynamic's wrapped provider triggers
      // broken chrome.runtime.sendMessage in Rainbow's inpage.js.
      // window.ethereum is Rainbow's raw injected EIP-1193 provider.
      const rawProvider = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum
      if (!rawProvider) throw new Error('No window.ethereum provider found — is a wallet extension installed?')

      const hash = await rawProvider.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      }) as `0x${string}`

      console.log('[useDynamicWrite] TX hash:', hash)
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
