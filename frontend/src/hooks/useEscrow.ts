import { useReadContract } from 'wagmi'
import { MANAGER_ABI, ESCROW_MANAGER_ADDRESS } from '@/lib/constants'
import type { Address, DealDetails } from '@/lib/types'
import { EscrowStatus } from '@/lib/types'

export function useDealDetails(dealId: bigint) {
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
      }
    : undefined

  return { ...result, details }
}
