import { useState, useCallback } from 'react'
import { getWalletAccounts, switchActiveNetwork } from '@dynamic-labs-sdk/client'
import { createWalletClientForWalletAccount } from '@dynamic-labs-sdk/evm/viem'
import {
  encodeFunctionData,
  createPublicClient,
  createWalletClient,
  http,
  custom,
} from 'viem'
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

type EIP1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

/**
 * Drop-in replacement for wagmi's useWriteContract.
 *
 * MetaMask path: uses window.ethereum directly and reads the currently
 * active account via eth_requestAccounts. This avoids the 4100 Unauthorized
 * error caused by Dynamic's stored address diverging from MetaMask's selected
 * account (validateAndNormalizeKeyholder rejects mismatched `from`).
 *
 * Non-MetaMask path: falls back to Dynamic's createWalletClientForWalletAccount.
 *
 * Switches to the target chain (mainnet or Sepolia) — chain determined by
 * VITE_NETWORK env var via getTargetChainId().
 */
export function useDynamicWriteContract() {
  const [state, setState] = useState<WriteState>(IDLE)

  const writeContract = useCallback(async (params: WriteContractParams) => {
    setState({ ...IDLE, isPending: true })

    try {
      const accounts = getWalletAccounts()
      if (!accounts || accounts.length === 0) throw new Error('No wallet connected')

      // Prefer MetaMask over Rainbow — Rainbow's inpage.js breaks chrome.runtime.sendMessage
      const walletAccount = accounts.find(a => a.walletProviderKey?.includes('metamask'))
        ?? accounts.find(a => !a.walletProviderKey?.includes('rainbow'))
        ?? accounts[0]

      console.log('[useDynamicWrite] Selected wallet:', walletAccount.address, '/', walletAccount.walletProviderKey)

      const data = encodeFunctionData({
        abi: params.abi,
        functionName: params.functionName,
        args: params.args ?? [],
      })
      const value = params.value ?? 0n

      // ── Build wallet client & resolve active `from` address ────────────────
      // For MetaMask: bypass Dynamic's routing — use window.ethereum directly so
      // MetaMask's validateAndNormalizeKeyholder sees the currently selected account.
      const isMetaMask = !!walletAccount.walletProviderKey?.includes('metamask')
      const rawEthereum = (typeof window !== 'undefined')
        ? (window as unknown as { ethereum?: EIP1193Provider }).ethereum
        : undefined

      let fromAddress: `0x${string}` = walletAccount.address as `0x${string}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let walletClientAny: any

      if (isMetaMask && rawEthereum) {
        // ── MetaMask direct path ──────────────────────────────────────────────
        // eth_requestAccounts returns MetaMask's currently selected account and
        // satisfies the connection check required before eth_sendTransaction.
        const mmAccounts = await rawEthereum.request({ method: 'eth_requestAccounts' }) as string[]
        fromAddress = (mmAccounts[0] ?? walletAccount.address) as `0x${string}`
        console.log('[useDynamicWrite] MetaMask active account:', fromAddress)

        // Switch to target chain directly via window.ethereum
        const chainHex = await rawEthereum.request({ method: 'eth_chainId' }) as string
        if (parseInt(chainHex, 16) !== TARGET_CHAIN.id) {
          console.log('[useDynamicWrite] Switching chain via window.ethereum...')
          try {
            await rawEthereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${TARGET_CHAIN.id.toString(16)}` }],
            })
            await new Promise(r => setTimeout(r, 1000))
          } catch (switchErr: unknown) {
            if ((switchErr as { code?: number })?.code === 4902) {
              await rawEthereum.request({
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
        }

        walletClientAny = createWalletClient({
          account: fromAddress,
          chain: TARGET_CHAIN,
          transport: custom(rawEthereum),
        })
      } else {
        // ── Non-MetaMask path (embedded wallet, Rainbow, etc.) ─────────────────
        console.log('[useDynamicWrite] Creating WalletClient via Dynamic for', walletAccount.walletProviderKey)

        // Switch to target chain via Dynamic SDK
        try {
          await switchActiveNetwork({ walletAccount, networkId: TARGET_CHAIN_ID })
          console.log('[useDynamicWrite] Network switched to', TARGET_CHAIN.name)
        } catch (e) {
          console.log('[useDynamicWrite] switchActiveNetwork:', (e as Error)?.message ?? 'ok')
        }

        let dynamicClient: Awaited<ReturnType<typeof createWalletClientForWalletAccount>>
        try {
          dynamicClient = await createWalletClientForWalletAccount({ walletAccount })
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

        // Switch chain via Dynamic's wallet client
        try {
          const chainHex = await dynamicClient.request({ method: 'eth_chainId' }) as string
          if (parseInt(chainHex, 16) !== TARGET_CHAIN.id) {
            try {
              await dynamicClient.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${TARGET_CHAIN.id.toString(16)}` }],
              })
              await new Promise(r => setTimeout(r, 1000))
            } catch (switchErr: unknown) {
              if ((switchErr as { code?: number })?.code === 4902) {
                await dynamicClient.request({
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
          }
        } catch (e) {
          console.warn('[useDynamicWrite] Chain switch via Dynamic:', e)
        }

        walletClientAny = dynamicClient
      }

      // ── Pre-flight simulation ──────────────────────────────────────────────
      // simulateContract decodes custom errors (WrongState, NotParticipant, …)
      // and throws BEFORE we send — no gas wasted on doomed transactions.
      const publicClient = createPublicClient({
        chain: TARGET_CHAIN,
        transport: http(getRpcUrl()),
      })
      try {
        await publicClient.simulateContract({
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: (params.args ?? []) as never[],
          account: fromAddress,
          value: value ?? 0n,
        })
        console.log('[useDynamicWrite] Simulation passed ✓')
      } catch (simErr) {
        console.error('[useDynamicWrite] Simulation failed (tx would revert):', simErr)
        throw simErr
      }

      // ── Gas estimation ────────────────────────────────────────────────────
      // +20% buffer, capped at 5M — well below MetaMask's 16.7M hard cap.
      let gasLimit: bigint
      try {
        const estimated = await publicClient.estimateGas({
          account: fromAddress,
          to: params.address,
          data,
          value: value ?? 0n,
        })
        gasLimit = estimated * 120n / 100n
        if (gasLimit > 5_000_000n) gasLimit = 5_000_000n
      } catch (e) {
        gasLimit = 2_000_000n // safe fallback
        console.warn('[useDynamicWrite] estimateGas failed after passing simulation, using 2M fallback:', e)
      }

      // ── Send transaction ──────────────────────────────────────────────────
      const hash = await walletClientAny.sendTransaction({
        to: params.address,
        data,
        value,
        gas: gasLimit,
        chain: null,
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
