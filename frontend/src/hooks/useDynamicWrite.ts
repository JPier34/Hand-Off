import { useState, useCallback } from 'react'
import { getWalletAccounts, switchActiveNetwork } from '@dynamic-labs-sdk/client'
import { createWalletClientForWalletAccount } from '@dynamic-labs-sdk/evm/viem'
import { encodeFunctionData, createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

import type { Abi, Address } from 'viem'

const ETH_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'

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
 * Switches to Ethereum Sepolia via Dynamic's switchActiveNetwork if needed.
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

      // Switch to Ethereum Sepolia if needed — uses Dynamic SDK which routes to the CORRECT wallet
      try {
        await switchActiveNetwork({ walletAccount, networkId: ETH_SEPOLIA_ID })
        console.log('[useDynamicWrite] Network switched to Ethereum Sepolia')
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
            'Ethereum Sepolia not configured in Dynamic dashboard. ' +
            'Go to app.dynamic.xyz → Chains & Networks → enable Ethereum Sepolia (11155111).'
          )
        }
        throw e
      }

      // Switch chain via the wallet client's own provider (MetaMask, not window.ethereum)
      try {
        const currentChainHex = await walletClient.request({ method: 'eth_chainId' }) as string
        const currentChainId = parseInt(currentChainHex, 16)
        if (currentChainId !== sepolia.id) {
          console.log('[useDynamicWrite] Wallet on chain', currentChainId, '→ switching to Ethereum Sepolia via WalletClient')
          try {
            await walletClient.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${sepolia.id.toString(16)}` }],
            })
          } catch (switchErr: unknown) {
            if ((switchErr as { code?: number })?.code === 4902) {
              await walletClient.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${sepolia.id.toString(16)}`,
                  chainName: 'Ethereum Sepolia',
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                  rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
                  blockExplorerUrls: ['https://sepolia.etherscan.io'],
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

      // ── Pre-flight simulation ────────────────────────────────────────────────
      // simulateContract decodes custom errors (WrongState, NotParticipant, …)
      // and throws BEFORE we send, so users see a clear message instead of a
      // failed on-chain transaction that still costs gas.
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(ETH_SEPOLIA_RPC),
      })
      try {
        await publicClient.simulateContract({
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: (params.args ?? []) as never[],
          account: walletAccount.address as `0x${string}`,
          value: value ?? 0n,
        })
        console.log('[useDynamicWrite] Simulation passed ✓')
      } catch (simErr) {
        // Transaction WILL revert — throw decoded error immediately (no gas wasted)
        console.error('[useDynamicWrite] Simulation failed (tx would revert):', simErr)
        throw simErr
      }

      // ── Gas estimation ───────────────────────────────────────────────────────
      // Simulation already confirmed the tx will succeed; now just get the limit.
      // Prevents viem auto-estimating 21M which MetaMask hard-caps at 16.7M.
      let gasLimit: bigint
      try {
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
        // Simulation passed but estimateGas failed for some other reason — safe fallback
        gasLimit = 1_000_000n
        console.warn('[useDynamicWrite] estimateGas failed after passing simulation, using 1M fallback:', e)
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
