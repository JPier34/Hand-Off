import { useContractRead } from '@/hooks/useContractRead'
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
  const result = useContractRead({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getReputation',
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !MOCK_MODE && !!walletAddress },
  })

  if (MOCK_MODE) {
    return { reputation: MOCK_REP, isLoading: false }
  }

  const raw = result.data as
    | [bigint, number, number, number, number, number, number]
    | undefined

  const reputation: ReputationData = raw
    ? {
        sellerTotalVolume:    raw[0],
        sellerDealCount:      raw[1],
        sellerPositiveReviews: raw[2],
        sellerTotalReviews:   raw[3],
        buyerDealCount:       raw[4],
        buyerPositiveReviews: raw[5],
        buyerTotalReviews:    raw[6],
      }
    : EMPTY

  return { reputation, isLoading: result.isLoading }
}
