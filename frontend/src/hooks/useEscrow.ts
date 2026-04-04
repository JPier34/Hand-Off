import { useState, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import { MANAGER_ABI, ESCROW_MANAGER_ADDRESS } from '@/lib/constants'
import type { Address, DealDetails } from '@/lib/types'
import { EscrowStatus } from '@/lib/types'
import { MOCK_MODE, getMockDeal } from '@/lib/mock'

// ─── Real hook ────────────────────────────────────────────────────────────────

function useRealDealDetails(dealId: bigint) {
  const result = useReadContract({
    address: ESCROW_MANAGER_ADDRESS,
    abi: MANAGER_ABI,
    functionName: 'getDeal',
    args: [dealId],
    query: { refetchInterval: 5_000 },
  })

  const raw = result.data as
    | [Address, Address, bigint, number, bigint, string]
    | undefined

  const details: DealDetails | undefined = raw
    ? {
        seller:      raw[0],
        buyer:       raw[1],
        amount:      raw[2],
        status:      raw[3] as EscrowStatus,
        expiresAt:   raw[4],
        description: raw[5],
        payoutToken: null, // TODO: read from contract when ABI includes payoutToken
      }
    : undefined

  return { ...result, details }
}

// ─── Mock hook ─────────────────────────────────────────────────────────────────
// Polls the module-level mock state every 500ms so components re-render after
// mockDeposit / mockRelease / mockRefund calls.

function useMockDealDetails(dealId: bigint) {
  const [, tick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 500)
    return () => clearInterval(id)
  }, [])

  return {
    details:   getMockDeal(dealId),
    isLoading: false,
    isError:   false,
    error:     null,
  }
}

// ─── Public export ─────────────────────────────────────────────────────────────
// Both hooks are always called (rules of hooks); we just pick the result.

export function useDealDetails(dealId: bigint) {
  const real = useRealDealDetails(dealId)
  const mock = useMockDealDetails(dealId)
  return MOCK_MODE ? mock : real
}
