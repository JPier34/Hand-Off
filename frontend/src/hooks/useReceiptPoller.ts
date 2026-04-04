import { useState, useEffect } from 'react'
import { createPublicClient, http, type TransactionReceipt } from 'viem'
import { sepolia } from 'viem/chains'

/**
 * Polls for a transaction receipt directly via the public RPC,
 * bypassing wagmi's transport which hangs when the Dynamic-wagmi
 * connector doesn't properly sync chain/account state.
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

    const client = createPublicClient({
      chain: sepolia,
      transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
    })

    let attempts = 0
    const maxAttempts = 120 // 2 minutes at 1s intervals

    const poll = async () => {
      while (!cancelled && attempts < maxAttempts) {
        try {
          const r = await client.getTransactionReceipt({ hash })
          if (cancelled) return
          console.log('[useReceiptPoller] Receipt found:', r.status, 'logs:', r.logs.length)
          setReceipt(r)
          setIsLoading(false)
          if (r.status === 'success') {
            setIsSuccess(true)
          } else {
            setIsError(true)
            setError(new Error('Transaction reverted'))
          }
          return
        } catch {
          // Receipt not yet available — wait and retry
          attempts++
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
      if (!cancelled) {
        setIsLoading(false)
        setIsError(true)
        setError(new Error('Receipt polling timed out'))
      }
    }

    poll()
    return () => { cancelled = true }
  }, [hash])

  return { receipt, isLoading, isSuccess, isError, error }
}
