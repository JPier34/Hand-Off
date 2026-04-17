import { useReadContract, useReadContracts } from 'wagmi'
import { REPUTATION_ABI, REPUTATION_ADDRESS, HANDOFF_ABI } from '@/lib/constants'
import { MOCK_MODE } from '@/lib/mock'
import { EscrowStatus } from '@/lib/types'
import type { Address, DealDetails } from '@/lib/types'

export interface HistoryEntry {
  dealId: bigint
  role: 'seller' | 'buyer'
  deal: DealDetails
  date: number
}

export function useWalletHistory(walletAddress: Address | undefined) {
  const sellerResult = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getSellerHistory',
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !MOCK_MODE && !!walletAddress },
  })

  const buyerResult = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getBuyerHistory',
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !MOCK_MODE && !!walletAddress },
  })

  const sellerEscrows = (sellerResult.data as Address[] | undefined) ?? []
  const buyerEscrows = (buyerResult.data as Address[] | undefined) ?? []

  const escrowRoles: { escrow: Address; role: 'seller' | 'buyer' }[] = []
  const seen = new Set<string>()

  for (const addr of sellerEscrows) {
    if (!seen.has(addr)) {
      seen.add(addr)
      escrowRoles.push({ escrow: addr, role: 'seller' })
    }
  }
  for (const addr of buyerEscrows) {
    if (!seen.has(addr)) {
      seen.add(addr)
      escrowRoles.push({ escrow: addr, role: 'buyer' })
    }
  }

  const dealInfoCalls = escrowRoles.map(({ escrow }) => ({
    address: escrow,
    abi: HANDOFF_ABI,
    functionName: 'dealInfo' as const,
  }))

  const termsCalls = escrowRoles.map(({ escrow }) => ({
    address: escrow,
    abi: HANDOFF_ABI,
    functionName: 'getTerms' as const,
  }))

  const feeAmountCalls = escrowRoles.map(({ escrow }) => ({
    address: escrow,
    abi: HANDOFF_ABI,
    functionName: 'getFeeAmount' as const,
  }))

  const requiredFundingCalls = escrowRoles.map(({ escrow }) => ({
    address: escrow,
    abi: HANDOFF_ABI,
    functionName: 'getRequiredFunding' as const,
  }))

  const feeRecipientCalls = escrowRoles.map(({ escrow }) => ({
    address: escrow,
    abi: HANDOFF_ABI,
    functionName: 'FEE_RECIPIENT' as const,
  }))

  const feeBpsCalls = escrowRoles.map(({ escrow }) => ({
    address: escrow,
    abi: HANDOFF_ABI,
    functionName: 'PROTOCOL_FEE_BPS' as const,
  }))

  // Read the real on-chain DEAL_ID from each escrow so History routes hit the
  // right deal. Using the array index as dealId (the old behaviour) silently
  // navigated to whichever escrow the reputation registry had at that index.
  const dealIdCalls = escrowRoles.map(({ escrow }) => ({
    address: escrow,
    abi: HANDOFF_ABI,
    functionName: 'DEAL_ID' as const,
  }))

  const enabled = !MOCK_MODE && escrowRoles.length > 0
  const infoResults = useReadContracts({ contracts: dealInfoCalls, query: { enabled } })
  const termsResults = useReadContracts({ contracts: termsCalls, query: { enabled } })
  const feeAmountResults = useReadContracts({ contracts: feeAmountCalls, query: { enabled } })
  const requiredFundingResults = useReadContracts({ contracts: requiredFundingCalls, query: { enabled } })
  const feeRecipientResults = useReadContracts({ contracts: feeRecipientCalls, query: { enabled } })
  const feeBpsResults = useReadContracts({ contracts: feeBpsCalls, query: { enabled } })
  const dealIdResults = useReadContracts({ contracts: dealIdCalls, query: { enabled } })

  const isLoading =
    sellerResult.isLoading ||
    buyerResult.isLoading ||
    infoResults.isLoading ||
    termsResults.isLoading ||
    feeAmountResults.isLoading ||
    requiredFundingResults.isLoading ||
    feeRecipientResults.isLoading ||
    feeBpsResults.isLoading ||
    dealIdResults.isLoading

  const entries: HistoryEntry[] = []

  if (
    !isLoading &&
    infoResults.data &&
    termsResults.data &&
    feeAmountResults.data &&
    requiredFundingResults.data &&
    feeRecipientResults.data &&
    feeBpsResults.data &&
    dealIdResults.data
  ) {
    for (let i = 0; i < escrowRoles.length; i++) {
      const { role } = escrowRoles[i]
      const infoRaw = infoResults.data[i]?.result as [Address, Address, bigint, bigint, number, string, string] | undefined
      const termsRaw = termsResults.data[i]?.result as [bigint, Address, Address, bigint, bigint] | undefined
      const feeAmount = (feeAmountResults.data[i]?.result as bigint | undefined) ?? 0n
      const requiredFunding = (requiredFundingResults.data[i]?.result as bigint | undefined) ?? (termsRaw?.[0] ?? infoRaw?.[3] ?? 0n)
      const feeRecipient = (feeRecipientResults.data[i]?.result as Address | undefined) ?? null
      const protocolFeeBps = (feeBpsResults.data[i]?.result as bigint | undefined) ?? 0n
      const dealId = dealIdResults.data[i]?.result as bigint | undefined

      if (!infoRaw || dealId === undefined) continue

      const payoutTokenAddr = termsRaw?.[1] === '0x0000000000000000000000000000000000000000'
        ? null
        : (termsRaw?.[1] ?? null)

      const deal: DealDetails = {
        seller: infoRaw[0],
        buyer: infoRaw[1],
        amount: termsRaw?.[0] ?? infoRaw[3],
        feeAmount,
        requiredFunding,
        feeRecipient,
        protocolFeeBps,
        status: infoRaw[4] as EscrowStatus,
        expiresAt: infoRaw[2],
        description: '',
        sellerEns: infoRaw[5],
        buyerEns: infoRaw[6],
        payoutToken: payoutTokenAddr,
      }

      const date = Number(infoRaw[2]) * 1000 - 7 * 24 * 60 * 60 * 1000
      entries.push({ dealId, role, deal, date })
    }

    entries.sort((a, b) => b.date - a.date)
  }

  return { entries, isLoading }
}
