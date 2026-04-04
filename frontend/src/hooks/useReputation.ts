import { useReadContract } from 'wagmi'
import { REPUTATION_ABI, REPUTATION_ADDRESS } from '@/lib/constants'
import { MOCK_MODE } from '@/lib/mock'
import type { Address } from '@/lib/types'

export interface ReputationData {
  sellerTotalVolume:    bigint
  sellerDealCount:      number
  sellerPositiveReviews: number
  sellerTotalReviews:   number
  buyerDealCount:       number
  buyerPositiveReviews: number
  buyerTotalReviews:    number
}

const EMPTY: ReputationData = {
  sellerTotalVolume: 0n,
  sellerDealCount: 0,
  sellerPositiveReviews: 0,
  sellerTotalReviews: 0,
  buyerDealCount: 0,
  buyerPositiveReviews: 0,
  buyerTotalReviews: 0,
}

const MOCK_REP: ReputationData = {
  sellerTotalVolume: 2_500_000_000_000_000_000n, // 2.5 ETH
  sellerDealCount: 16,
  sellerPositiveReviews: 12,
  sellerTotalReviews: 16,
  buyerDealCount: 8,
  buyerPositiveReviews: 7,
  buyerTotalReviews: 8,
}

export function useReputation(walletAddress: Address | undefined) {
  const result = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getReputation',
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !MOCK_MODE && !!walletAddress },
  })

  if (MOCK_MODE) {
    return { reputation: MOCK_REP, isLoading: false }
  }

  // wagmi decodes named tuples as objects with named properties, not arrays
  const raw = result.data as
    | { sellerTotalVolume: bigint; sellerDealCount: number; sellerPositiveReviews: number; sellerTotalReviews: number; buyerDealCount: number; buyerPositiveReviews: number; buyerTotalReviews: number }
    | undefined

  const reputation: ReputationData = raw
    ? {
        sellerTotalVolume:     raw.sellerTotalVolume,
        sellerDealCount:       Number(raw.sellerDealCount),
        sellerPositiveReviews: Number(raw.sellerPositiveReviews),
        sellerTotalReviews:    Number(raw.sellerTotalReviews),
        buyerDealCount:        Number(raw.buyerDealCount),
        buyerPositiveReviews:  Number(raw.buyerPositiveReviews),
        buyerTotalReviews:     Number(raw.buyerTotalReviews),
      }
    : EMPTY

  return { reputation, isLoading: result.isLoading }
}
