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
  const [receipt, setReceipt] = useState<TransactionReceipt | undefined>()
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isError, setIsError] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!hash) return

    let cancelled = false
    setIsLoading(true)
    setIsSuccess(false)
    setIsError(false)
    setError(null)
    setReceipt(undefined)

    waitForReceipt(publicClient, hash)
      .then((r: TransactionReceipt) => {
        if (cancelled) return
        console.log('[useReceiptPoller] Receipt:', r.status, 'logs:', r.logs.length)
        setReceipt(r)
        setIsLoading(false)
        if (r.status === 'success') {
          setIsSuccess(true)
        } else {
          setIsError(true)
          setError(new Error('Transaction reverted'))
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('[useReceiptPoller] Error:', err)
        setIsLoading(false)
        setIsError(true)
        setError(err instanceof Error ? err : new Error('Failed to get receipt'))
      })

    return () => { cancelled = true }
  }, [hash])

  return { receipt, isLoading, isSuccess, isError, error }
}
