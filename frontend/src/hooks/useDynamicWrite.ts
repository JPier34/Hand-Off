import { useState, useCallback } from 'react'
import { getWalletAccounts, switchActiveNetwork } from '@dynamic-labs-sdk/client'
import { createWalletClientForWalletAccount } from '@dynamic-labs-sdk/evm/viem'
import { encodeFunctionData, createPublicClient, http } from 'viem'
import { sepolia, mainnet } from 'viem/chains'
import { getTargetChainId, CHAIN_IDS, getRpcUrl, getExplorerUrl } from '@/lib/chains'

import type { Abi, Address } from 'viem'

const TARGET_CHAIN    = getTargetChainId() === CHAIN_IDS.MAINNET ? mainnet : sepolia
const TARGET_CHAIN_ID = String(TARGET_CHAIN.id)

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

const ETH_SEPOLIA_ID = String(sepolia.id) // "11155111"

/**
 * Drop-in replacement for wagmi's useWriteContract that uses
 * Dynamic SDK's wallet provider.
 *
 * Uses Dynamic's createWalletClientForWalletAccount to get a viem
 * WalletClient for the ACTUAL connected wallet (MetaMask, Rainbow, etc),
 * not window.ethereum which may be a different extension.
 *
 * Switches to the target chain (mainnet or Sepolia) via Dynamic's
 * switchActiveNetwork if needed. Chain is determined by VITE_NETWORK env var.
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
      if (!accounts || accounts.length === 0) throw new Error('No wallet connected')

      // Prefer MetaMask over Rainbow — Rainbow's inpage.js has a broken
      // chrome.runtime.sendMessage that prevents transactions from working.
      const walletAccount = accounts.find(a => a.walletProviderKey?.includes('metamask'))
        ?? accounts.find(a => !a.walletProviderKey?.includes('rainbow'))
        ?? accounts[0]

      console.log('[useDynamicWrite] Wallet:', walletAccount.address, 'provider:', walletAccount.walletProviderKey, '(from', accounts.length, 'accounts)')

      // Switch to target chain if needed — uses Dynamic SDK which routes to the CORRECT wallet
      try {
        await switchActiveNetwork({ walletAccount, networkId: TARGET_CHAIN_ID })
        console.log('[useDynamicWrite] Network switched to', TARGET_CHAIN.name)
      } catch (e) {
        // May throw if already on correct chain or if network needs to be added
        console.log('[useDynamicWrite] switchActiveNetwork result:', (e as Error)?.message ?? 'ok')
      }

      const data = encodeFunctionData({
        abi: params.abi,
        functionName: params.functionName,
        args: params.args ?? [],
      })

      const value = params.value ?? 0n

      // Use Dynamic's WalletClient — routes to the correct wallet extension
      console.log('[useDynamicWrite] Creating WalletClient for', walletAccount.walletProviderKey)
      let walletClient
      try {
        walletClient = await createWalletClientForWalletAccount({ walletAccount })
      } catch (e) {
        const msg = (e as Error)?.message ?? ''
        if (msg.includes('No network data')) {
          throw new Error(
            `${TARGET_CHAIN.name} not configured in Dynamic dashboard. ` +
            `Go to app.dynamic.xyz → Chains & Networks → enable ${TARGET_CHAIN.name} (${TARGET_CHAIN.id}).`
          )
        }
        throw e
      }

      // Switch chain via the wallet client's own provider (MetaMask, not window.ethereum)
      try {
        const currentChainHex = await walletClient.request({ method: 'eth_chainId' }) as string
        const currentChainId = parseInt(currentChainHex, 16)
        if (currentChainId !== TARGET_CHAIN.id) {
          console.log('[useDynamicWrite] Wallet on chain', currentChainId, '→ switching to', TARGET_CHAIN.name, 'via WalletClient')
          try {
            await walletClient.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${TARGET_CHAIN.id.toString(16)}` }],
            })
          } catch (switchErr: unknown) {
            if ((switchErr as { code?: number })?.code === 4902) {
              await walletClient.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${TARGET_CHAIN.id.toString(16)}`,
                  chainName: TARGET_CHAIN.name,
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                  rpcUrls: [getRpcUrl()],
                  blockExplorerUrls: [getExplorerUrl()],
                }],
              })
            } else {
              throw switchErr
            }
          }
          console.log('[useDynamicWrite] Chain switched, waiting for wallet to settle...')
          await new Promise(r => setTimeout(r, 1000))
        }
      } catch (e) {
        console.warn('[useDynamicWrite] Chain switch attempt:', e)
      }

      // Estimate gas via a public RPC — prevents viem auto-estimating 21M which MetaMask caps at 16.7M
      let gasLimit: bigint
      try {
        const publicClient = createPublicClient({
          chain: TARGET_CHAIN,
          transport: http(getRpcUrl()),
        })
        const estimated = await publicClient.estimateGas({
          account: walletAccount.address as `0x${string}`,
          to: params.address,
          data,
          value: value ?? 0n,
        })
        // +20% buffer, hard-capped at 5M (well below MetaMask's 16.7M cap)
        gasLimit = estimated * 120n / 100n
        if (gasLimit > 5_000_000n) gasLimit = 5_000_000n
        console.log('[useDynamicWrite] Gas estimate:', estimated.toString(), '→ using:', gasLimit.toString())
      } catch (e) {
        gasLimit = 1_000_000n // safe fallback
        console.warn('[useDynamicWrite] Gas estimation failed, using fallback 1M:', e)
      }

      // Send tx without chain assertion — we already switched above
      const hash = await walletClient.sendTransaction({
        to: params.address,
        data,
        value,
        gas: gasLimit,
        chain: null,
      })

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
