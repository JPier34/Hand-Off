import { useState, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import { REPUTATION_ABI, REPUTATION_ADDRESS, HANDOFF_ABI } from '@/lib/constants'
import type { Address, DealDetails } from '@/lib/types'
import { EscrowStatus } from '@/lib/types'
import { MOCK_MODE, getMockDeal } from '@/lib/mock'

// ─── Real hook (two-step: dealId → escrow address → dealInfo) ────────────────

function useRealDealDetails(dealId: bigint) {
  // Step 1: Resolve dealId → escrow address via Reputation registry
  const addressResult = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getEscrowFromDealId',
    args: [dealId],
    query: { enabled: !MOCK_MODE },
  })

  const escrowAddress = addressResult.data as Address | undefined

  // Step 2: Read dealInfo() from the per-deal escrow contract
  const infoResult = useReadContract({
    address: escrowAddress,
    abi: HANDOFF_ABI,
    functionName: 'dealInfo',
    query: {
      enabled: !MOCK_MODE && !!escrowAddress,
      refetchInterval: 5_000,
    },
  })

  // Step 3: Read payoutToken() separately (not included in dealInfo)
  const tokenResult = useReadContract({
    address: escrowAddress,
    abi: HANDOFF_ABI,
    functionName: 'payoutToken',
    query: { enabled: !MOCK_MODE && !!escrowAddress },
  })

  // dealInfo returns: (seller, buyer, expiresAt, balance, state, sellerEns, buyerEns)
  const raw = infoResult.data as
    | [Address, Address, bigint, bigint, number, string, string]
    | undefined

  const payoutTokenAddr = tokenResult.data as Address | undefined

  const details: DealDetails | undefined = raw
    ? {
        seller:      raw[0],
        buyer:       raw[1],
        amount:      raw[3], // balance
        status:      raw[4] as EscrowStatus,
        expiresAt:   raw[2],
        description: '',     // not on-chain — frontend-only field
        sellerEns:   raw[5],
        buyerEns:    raw[6],
        payoutToken: payoutTokenAddr === '0x0000000000000000000000000000000000000000'
          ? null
          : (payoutTokenAddr ?? null),
      }
    : undefined

  const isLoading = addressResult.isLoading || infoResult.isLoading || tokenResult.isLoading
  const isError = addressResult.isError || infoResult.isError

  return { details, isLoading, isError, escrowAddress }
}

// ─── Mock hook ─────────────────────────────────────────────────────────────────

function useMockDealDetails(dealId: bigint) {
  const [, tick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 500)
    return () => clearInterval(id)
  }, [])

  return {
    details:       getMockDeal(dealId),
    isLoading:     false,
    isError:       false,
    error:         null,
    escrowAddress: undefined as Address | undefined,
  }
}

// ─── Public export ─────────────────────────────────────────────────────────────

export function useDealDetails(dealId: bigint) {
  const real = useRealDealDetails(dealId)
  const mock = useMockDealDetails(dealId)
  return MOCK_MODE ? mock : real
}
