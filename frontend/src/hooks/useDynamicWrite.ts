import { useState, useCallback } from 'react'
import { getWalletAccounts, switchActiveNetwork } from '@dynamic-labs-sdk/client'
import { createWalletClientForWalletAccount } from '@dynamic-labs-sdk/evm/viem'
import { encodeFunctionData } from 'viem'
import { baseSepolia } from 'viem/chains'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'
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

const BASE_SEPOLIA_ID = String(baseSepolia.id) // "84532"

/**
 * Drop-in replacement for wagmi's useWriteContract that uses
 * Dynamic SDK's wallet provider.
 *
 * Uses Dynamic's createWalletClientForWalletAccount to get a viem
 * WalletClient for the ACTUAL connected wallet (MetaMask, Rainbow, etc),
 * not window.ethereum which may be a different extension.
 *
 * Switches to Base Sepolia via Dynamic's switchActiveNetwork if needed.
 */
export function useDynamicWriteContract() {
  const [state, setState] = useState<WriteState>(IDLE)
  const { walletAddress: _activeAddress } = useDynamicAuth()

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

      // Use the wallet the user actively connected with (matches useDynamicAuth's walletAddress).
      // This ensures the wallet the user sees in the UI is the one that pays gas.
      const activeAddress = _activeAddress
      const walletAccount = (activeAddress
          ? accounts.find(a => a.address?.toLowerCase() === activeAddress.toLowerCase())
          : undefined)
        ?? accounts[0]

      console.log('[useDynamicWrite] Wallet:', walletAccount.address, 'provider:', walletAccount.walletProviderKey, '(from', accounts.length, 'accounts)')

      // Switch to Base Sepolia if needed — uses Dynamic SDK which routes to the CORRECT wallet
      try {
        await switchActiveNetwork({ walletAccount, networkId: BASE_SEPOLIA_ID })
        console.log('[useDynamicWrite] Network switched to Base Sepolia')
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
            'Base Sepolia not configured in Dynamic dashboard. ' +
            'Go to app.dynamic.xyz → Chains & Networks → enable Base Sepolia (84532).'
          )
        }
        throw e
      }

      // Switch chain via the wallet client's own provider (MetaMask, not window.ethereum)
      try {
        const currentChainHex = await walletClient.request({ method: 'eth_chainId' }) as string
        const currentChainId = parseInt(currentChainHex, 16)
        if (currentChainId !== baseSepolia.id) {
          console.log('[useDynamicWrite] Wallet on chain', currentChainId, '→ switching to Base Sepolia via WalletClient')
          try {
            await walletClient.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${baseSepolia.id.toString(16)}` }],
            })
          } catch (switchErr: unknown) {
            if ((switchErr as { code?: number })?.code === 4902) {
              await walletClient.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${baseSepolia.id.toString(16)}`,
                  chainName: 'Base Sepolia',
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                  rpcUrls: ['https://sepolia.base.org'],
                  blockExplorerUrls: ['https://sepolia.basescan.org'],
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

      // Send tx without chain assertion — we already switched above
      const hash = await walletClient.sendTransaction({
        to: params.address,
        data,
        value,
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
  }, [_activeAddress])

  return {
    writeContract,
    data: state.data,
    isPending: state.isPending,
    isError: state.isError,
    error: state.error,
  }
}
