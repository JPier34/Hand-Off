import { useState, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import { isAddress } from 'viem'
import { REPUTATION_ABI, REPUTATION_ADDRESS, HANDOFF_ABI } from '@/lib/constants'
import type { Address, DealDetails } from '@/lib/types'
import { EscrowStatus } from '@/lib/types'
import { MOCK_MODE, getMockDeal } from '@/lib/mock'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a URL param as either an escrow address or a numeric dealId */
export function parseDealParam(param: string | undefined): { dealId?: bigint; escrowAddress?: Address } {
  if (!param) return {}
  if (isAddress(param)) return { escrowAddress: param as Address }
  const n = Number(param)
  if (Number.isInteger(n) && n > 0) return { dealId: BigInt(n) }
  return {}
}

// ─── Real hook (supports both dealId and direct escrow address) ──────────────

function useRealDealDetails(dealId: bigint | undefined, directEscrowAddress: Address | undefined) {
  // Step 1: Resolve dealId → escrow address via Reputation registry (skip if we already have address)
  const addressResult = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getEscrowFromDealId',
    args: dealId ? [dealId] : undefined,
    query: { enabled: !MOCK_MODE && !!dealId && !directEscrowAddress },
  })

  const escrowAddress = directEscrowAddress ?? (addressResult.data as Address | undefined)

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

  const isLoading = (!!dealId && !directEscrowAddress && addressResult.isLoading) || infoResult.isLoading || tokenResult.isLoading
  const isError = addressResult.isError || infoResult.isError

  return { details, isLoading, isError, escrowAddress }
}

// ─── Mock hook ─────────────────────────────────────────────────────────────────

function useMockDealDetails(dealId: bigint | undefined) {
  const [, tick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 500)
    return () => clearInterval(id)
  }, [])

  return {
    details:       dealId ? getMockDeal(dealId) : undefined,
    isLoading:     false,
    isError:       false,
    error:         null,
    escrowAddress: undefined as Address | undefined,
  }
}

// ─── Public export ─────────────────────────────────────────────────────────────

export function useDealDetails(dealId: bigint | undefined, escrowAddress?: Address) {
  const real = useRealDealDetails(dealId, escrowAddress)
  const mock = useMockDealDetails(dealId)
  return MOCK_MODE ? mock : real
}
