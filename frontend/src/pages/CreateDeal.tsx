import { Layout } from '@/components/Layout'

// TODO T-08a: Build this screen from the Figma design.
// Use the prompt from PROMPTS.md → T-08a.
// Logic to wire up (do not remove):
//   - useCreateDeal from @/hooks/useEscrowWrite
//   - Input validation (see component-patterns.md → validation pattern)
//   - All 4 transaction states: isPending, isConfirming, isSuccess, isError
//
// Success screen shows TWO steps:
//   [1] Share buyer link:  /pay/${newDealId}
//       - Inline copy button inside the link field
//       - Share button: navigator.share() on mobile (Web Share API), WhatsApp fallback on desktop
//         const canNativeShare = typeof navigator.share !== 'undefined'
//   [2] Go to seller page: /deal/${newDealId} — "Go to my deal →" button
//       Seller needs this to enter the code the buyer shows them at the meetup

export default function CreateDeal() {
  return (
    <Layout>
      <main className="max-w-lg mx-auto px-4 py-8">
        <p className="text-hoff-text-tertiary text-sm">CreateDeal — implement from Figma</p>
      </main>
    </Layout>
  )
}
