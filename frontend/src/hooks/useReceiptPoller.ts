import { useState, useEffect } from 'react'
import { createPublicClient, http, type TransactionReceipt } from 'viem'
import { sepolia } from 'viem/chains'
import { waitForReceipt } from './receiptPollerLogic'

// Shared client — one instance reused across all receipt watchers in the session.
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
})

/**
 * Waits for a transaction receipt using viem's client.waitForTransactionReceipt.
 *
 * Uses a dedicated public RPC client rather than wagmi's transport, which can
 * hang when the Dynamic-wagmi connector doesn't fully sync chain/account state.
 *
 * Drop-in replacement for the previous manual polling loop.
 */
export function useReceiptPoller(hash: `0x${string}` | undefined) {
  const [state, setState] = useState<{
    watchedHash?: `0x${string}`
    receipt?: TransactionReceipt
    isSuccess: boolean
    isError: boolean
    error: Error | null
  }>({
    watchedHash: undefined,
    receipt: undefined,
    isSuccess: false,
    isError: false,
    error: null,
  })

  useEffect(() => {
    if (!hash) return

    let cancelled = false

    waitForReceipt(publicClient, hash)
      .then((r: TransactionReceipt) => {
        if (cancelled) return
        console.log('[useReceiptPoller] Receipt:', r.status, 'logs:', r.logs.length)
        setState({
          watchedHash: hash,
          receipt: r,
          isSuccess: r.status === 'success',
          isError: r.status !== 'success',
          error: r.status === 'success' ? null : new Error('Transaction reverted'),
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('[useReceiptPoller] Error:', err)
        setState({
          watchedHash: hash,
          receipt: undefined,
          isSuccess: false,
          isError: true,
          error: err instanceof Error ? err : new Error('Failed to get receipt'),
        })
      })

    return () => { cancelled = true }
  }, [hash])

  const isLoading = !!hash && state.watchedHash !== hash

  if (!hash) {
    return { receipt: undefined, isLoading: false, isSuccess: false, isError: false, error: null }
  }

  return {
    receipt: state.watchedHash === hash ? state.receipt : undefined,
    isLoading,
    isSuccess: state.watchedHash === hash ? state.isSuccess : false,
    isError: state.watchedHash === hash ? state.isError : false,
    error: state.watchedHash === hash ? state.error : null,
  }
}
