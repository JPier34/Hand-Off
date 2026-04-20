import { useState, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import { isAddress } from 'viem'
import { REPUTATION_ABI, REPUTATION_ADDRESS, HANDOFF_ABI } from '@/lib/constants'
import type { Address, DealDetails } from '@/lib/types'
import { EscrowStatus } from '@/lib/types'
import { MOCK_MODE, getMockDeal } from '@/lib/mock'
import { getTargetChainId } from '@/lib/chains'

/** Parse a URL param as either an escrow address or a numeric dealId */
export function parseDealParam(param: string | undefined): { dealId?: bigint; escrowAddress?: Address } {
  if (!param) return {}
  if (isAddress(param)) return { escrowAddress: param as Address }
  const n = Number(param)
  if (Number.isInteger(n) && n > 0) return { dealId: BigInt(n) }
  return {}
}

function useRealDealDetails(dealId: bigint | undefined, directEscrowAddress: Address | undefined) {
  const chainId = getTargetChainId()

  const addressResult = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getEscrowFromDealId',
    args: dealId ? [dealId] : undefined,
    chainId,
    query: { enabled: !MOCK_MODE && !!dealId && !directEscrowAddress },
  })

  const escrowAddress = directEscrowAddress ?? (addressResult.data as Address | undefined)

  const infoResult = useReadContract({
    address: escrowAddress,
    abi: HANDOFF_ABI,
    functionName: 'dealInfo',
    chainId,
    query: {
      enabled: !MOCK_MODE && !!escrowAddress,
      refetchInterval: 5_000,
    },
  })

  const termsResult = useReadContract({
    address: escrowAddress,
    abi: HANDOFF_ABI,
    functionName: 'getTerms',
    chainId,
    query: { enabled: !MOCK_MODE && !!escrowAddress },
  })

  const feeAmountResult = useReadContract({
    address: escrowAddress,
    abi: HANDOFF_ABI,
    functionName: 'getFeeAmount',
    chainId,
    query: { enabled: !MOCK_MODE && !!escrowAddress },
  })

  const requiredFundingResult = useReadContract({
    address: escrowAddress,
    abi: HANDOFF_ABI,
    functionName: 'getRequiredFunding',
    chainId,
    query: { enabled: !MOCK_MODE && !!escrowAddress },
  })

  const feeRecipientResult = useReadContract({
    address: escrowAddress,
    abi: HANDOFF_ABI,
    functionName: 'FEE_RECIPIENT',
    chainId,
    query: { enabled: !MOCK_MODE && !!escrowAddress },
  })

  const protocolFeeBpsResult = useReadContract({
    address: escrowAddress,
    abi: HANDOFF_ABI,
    functionName: 'PROTOCOL_FEE_BPS',
    chainId,
    query: { enabled: !MOCK_MODE && !!escrowAddress },
  })

  const raw = infoResult.data as
    | [Address, Address, bigint, bigint, number, string, string]
    | undefined

  const terms = termsResult.data as
    | [bigint, Address, Address, bigint, bigint]
    | undefined

  const payoutToken = terms?.[1] === '0x0000000000000000000000000000000000000000'
    ? null
    : (terms?.[1] ?? null)

  const sellerAmount = terms?.[0] ?? raw?.[3] ?? 0n
  const feeAmount = (feeAmountResult.data as bigint | undefined) ?? 0n
  const requiredFunding = (requiredFundingResult.data as bigint | undefined) ?? sellerAmount

  const details: DealDetails | undefined = raw
    ? {
        seller: raw[0],
        buyer: raw[1],
        amount: sellerAmount,
        feeAmount,
        requiredFunding,
        feeRecipient: (feeRecipientResult.data as Address | undefined) ?? null,
        protocolFeeBps: (protocolFeeBpsResult.data as bigint | undefined) ?? 0n,
        status: raw[4] as EscrowStatus,
        expiresAt: raw[2],
        description: '',
        sellerEns: raw[5],
        buyerEns: raw[6],
        payoutToken,
      }
    : undefined

  const isLoading =
    (!!dealId && !directEscrowAddress && addressResult.isLoading) ||
    infoResult.isLoading ||
    termsResult.isLoading ||
    feeAmountResult.isLoading ||
    requiredFundingResult.isLoading ||
    feeRecipientResult.isLoading ||
    protocolFeeBpsResult.isLoading

  const isError =
    addressResult.isError ||
    infoResult.isError ||
    termsResult.isError ||
    feeAmountResult.isError ||
    requiredFundingResult.isError ||
    feeRecipientResult.isError ||
    protocolFeeBpsResult.isError

  return { details, isLoading, isError, escrowAddress, refetch: infoResult.refetch }
}

function useMockDealDetails(dealId: bigint | undefined) {
  const [, tick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 500)
    return () => clearInterval(id)
  }, [])

  return {
    details: dealId ? getMockDeal(dealId) : undefined,
    isLoading: false,
    isError: false,
    error: null,
    escrowAddress: undefined as Address | undefined,
    refetch: () => {},
  }
}

export function useDealDetails(dealId: bigint | undefined, escrowAddress?: Address) {
  const real = useRealDealDetails(dealId, escrowAddress)
  const mock = useMockDealDetails(dealId)
  return MOCK_MODE ? mock : real
}
