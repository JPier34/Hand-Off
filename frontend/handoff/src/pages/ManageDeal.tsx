import { Layout } from '@/components/Layout'

// TODO T-08c: Build this screen from the Figma design.
// Use the prompt from PROMPTS.md → T-08c.
// Existing logic to wire up (do not remove):
//   - useDealDetails from @/hooks/useEscrow
//   - useReleaseEscrow + useClaimRefund from @/hooks/useEscrowWrite
//   - isValidDealId() guard at top (see component-patterns.md → DealId guard pattern)
//   - Route param: useParams<{ dealId: string }>() → BigInt(dealIdParam)
//   - isSeller check (details.seller === walletAddress)
//   - 4-digit code input → release button
//   - Refund path when isExpired
//   - All 4 transaction states

export default function ManageDeal() {
  return (
    <Layout>
      <main className="max-w-lg mx-auto px-4 py-8">
        <p className="text-hoff-text-tertiary text-sm">ManageDeal — implement from Figma</p>
      </main>
    </Layout>
  )
}
