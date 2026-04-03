import { Layout } from '@/components/Layout'

// TODO T-08b: Build this screen from the Figma design.
// Use the prompt from PROMPTS.md → T-08b.
// Logic to wire up:
//   - useDealDetails from @/hooks/useEscrow
//   - useDepositFunds from @/hooks/useEscrowWrite
//   - isValidDealId() guard at top (see component-patterns.md → DealId guard pattern)
//   - Route param: useParams<{ dealId: string }>() → BigInt(dealIdParam)
//   - All 4 transaction states
//
// Unlock code flow (random, client-side):
//   const [unlockCode, setUnlockCode] = useState<string | null>(null)
//   function handleDeposit(amount: string) {
//     const code = generateUnlockCode()        // crypto.getRandomValues()
//     setUnlockCode(code)
//     deposit(amount, hashUnlockCode(code))    // only hash goes on-chain
//   }
//   → show <CodeDisplay code={unlockCode} /> after isSuccess

export default function BuyerPay() {
  return (
    <Layout>
      <main className="max-w-lg mx-auto px-4 py-8">
        <p className="text-hoff-text-tertiary text-sm">BuyerPay — implement from Figma</p>
      </main>
    </Layout>
  )
}
