import { useReadContract, useReadContracts } from 'wagmi'
import { REPUTATION_ABI, REPUTATION_ADDRESS, HANDOFF_ABI } from '@/lib/constants'
import { MOCK_MODE } from '@/lib/mock'
import { EscrowStatus } from '@/lib/types'
import type { Address, DealDetails } from '@/lib/types'

export interface HistoryEntry {
  dealId:  bigint
  role:    'seller' | 'buyer'
  deal:    DealDetails
  date:    number // unix ms approximation from expiresAt - 7 days
}

export function useWalletHistory(walletAddress: Address | undefined) {
  // Step 1: fetch seller and buyer escrow address lists
  const sellerResult = useReadContract({
    address:      REPUTATION_ADDRESS,
    abi:          REPUTATION_ABI,
    functionName: 'getSellerHistory',
    args:         walletAddress ? [walletAddress] : undefined,
    query:        { enabled: !MOCK_MODE && !!walletAddress },
  })

  const buyerResult = useReadContract({
    address:      REPUTATION_ADDRESS,
    abi:          REPUTATION_ABI,
    functionName: 'getBuyerHistory',
    args:         walletAddress ? [walletAddress] : undefined,
    query:        { enabled: !MOCK_MODE && !!walletAddress },
  })

  const sellerEscrows = (sellerResult.data as Address[] | undefined) ?? []
  const buyerEscrows  = (buyerResult.data  as Address[] | undefined) ?? []

  // Build a deduplicated list: {escrow, role}
  const escrowRoles: { escrow: Address; role: 'seller' | 'buyer' }[] = []
  const seen = new Set<string>()

  for (const addr of sellerEscrows) {
    if (!seen.has(addr)) { seen.add(addr); escrowRoles.push({ escrow: addr, role: 'seller' }) }
  }
  for (const addr of buyerEscrows) {
    if (!seen.has(addr)) { seen.add(addr); escrowRoles.push({ escrow: addr, role: 'buyer' }) }
  }

  // Step 2: batch-read dealInfo() + getTerms() for all escrows
  const dealInfoCalls = escrowRoles.map(({ escrow }) => ({
    address:      escrow,
    abi:          HANDOFF_ABI,
    functionName: 'dealInfo' as const,
  }))

  const termsCalls = escrowRoles.map(({ escrow }) => ({
    address:      escrow,
    abi:          HANDOFF_ABI,
    functionName: 'getTerms' as const,
  }))

  const infoResults  = useReadContracts({ contracts: dealInfoCalls,  query: { enabled: !MOCK_MODE && escrowRoles.length > 0 } })
  const termsResults = useReadContracts({ contracts: termsCalls,     query: { enabled: !MOCK_MODE && escrowRoles.length > 0 } })

  const isLoading =
    sellerResult.isLoading || buyerResult.isLoading ||
    infoResults.isLoading  || termsResults.isLoading

  const entries: HistoryEntry[] = []

  if (!isLoading && infoResults.data && termsResults.data) {
    for (let i = 0; i < escrowRoles.length; i++) {
      const { escrow: _escrow, role } = escrowRoles[i]
      const infoRaw  = infoResults.data[i]?.result  as [Address, Address, bigint, bigint, number, string, string] | undefined
      const termsRaw = termsResults.data[i]?.result as [bigint, Address, Address, bigint, bigint] | undefined

      if (!infoRaw) continue

      const payoutTokenAddr = termsRaw?.[1] === '0x0000000000000000000000000000000000000000'
        ? null
        : (termsRaw?.[1] ?? null)

      const deal: DealDetails = {
        seller:      infoRaw[0],
        buyer:       infoRaw[1],
        amount:      termsRaw?.[0] ?? infoRaw[3],
        status:      infoRaw[4] as EscrowStatus,
        expiresAt:   infoRaw[2],
        description: '',
        sellerEns:   infoRaw[5],
        buyerEns:    infoRaw[6],
        payoutToken: payoutTokenAddr,
      }

      // Approximate creation date as expiresAt - 7 days (we don't store createdAt separately in history)
      const date = Number(infoRaw[2]) * 1000 - 7 * 24 * 60 * 60 * 1000

      entries.push({ dealId: BigInt(i + 1), role, deal, date })
    }

    // Newest first
    entries.sort((a, b) => b.date - a.date)
  }

  return { entries, isLoading }
}
