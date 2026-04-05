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
import { sepolia } from 'viem/chains'

import type { Abi, Address } from 'viem'

const ETH_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
const ETH_SEPOLIA_ID = String(sepolia.id) // "11155111"

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

        // Switch to Ethereum Sepolia directly via window.ethereum
        const chainHex = await rawEthereum.request({ method: 'eth_chainId' }) as string
        if (parseInt(chainHex, 16) !== sepolia.id) {
          console.log('[useDynamicWrite] Switching chain via window.ethereum...')
          try {
            await rawEthereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${sepolia.id.toString(16)}` }],
            })
            await new Promise(r => setTimeout(r, 1000))
          } catch (switchErr: unknown) {
            if ((switchErr as { code?: number })?.code === 4902) {
              await rawEthereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${sepolia.id.toString(16)}`,
                  chainName: 'Ethereum Sepolia',
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                  rpcUrls: [ETH_SEPOLIA_RPC],
                  blockExplorerUrls: ['https://sepolia.etherscan.io'],
                }],
              })
            } else {
              throw switchErr
            }
          }
        }

        walletClientAny = createWalletClient({
          account: fromAddress,
          chain: sepolia,
          transport: custom(rawEthereum),
        })
      } else {
        // ── Non-MetaMask path (embedded wallet, Rainbow, etc.) ──────────────���─
        console.log('[useDynamicWrite] Creating WalletClient via Dynamic for', walletAccount.walletProviderKey)

        // Switch to Ethereum Sepolia via Dynamic SDK
        try {
          await switchActiveNetwork({ walletAccount, networkId: ETH_SEPOLIA_ID })
          console.log('[useDynamicWrite] Network switched to Ethereum Sepolia')
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
              'Ethereum Sepolia not configured in Dynamic dashboard. ' +
              'Go to app.dynamic.xyz → Chains & Networks → enable Ethereum Sepolia (11155111).'
            )
          }
          throw e
        }

        // Switch chain via Dynamic's wallet client
        try {
          const chainHex = await dynamicClient.request({ method: 'eth_chainId' }) as string
          if (parseInt(chainHex, 16) !== sepolia.id) {
            try {
              await dynamicClient.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${sepolia.id.toString(16)}` }],
              })
              await new Promise(r => setTimeout(r, 1000))
            } catch (switchErr: unknown) {
              if ((switchErr as { code?: number })?.code === 4902) {
                await dynamicClient.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: `0x${sepolia.id.toString(16)}`,
                    chainName: 'Ethereum Sepolia',
                    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                    rpcUrls: [ETH_SEPOLIA_RPC],
                    blockExplorerUrls: ['https://sepolia.etherscan.io'],
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

      // ── Pre-flight simulation ───────────────────────────────────────────���─
      // simulateContract decodes custom errors (WrongState, NotParticipant, …)
      // and throws BEFORE we send — no gas wasted on doomed transactions.
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
        console.log('[useDynamicWrite] Gas estimate:', estimated.toString(), '→ using:', gasLimit.toString())
      } catch (e) {
        gasLimit = 1_000_000n
        console.warn('[useDynamicWrite] estimateGas failed after passing simulation, using 1M fallback:', e)
      }

      // ── Send transaction ──────────────────────────────────────────────────
      const hash = await walletClientAny.sendTransaction({
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
