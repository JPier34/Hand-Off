import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'

// Home — seller landing page.
// Buyers arrive via direct /pay/:dealId link — no choice screen needed.

export default function Home() {
  const navigate = useNavigate()

  return (
    <Layout>
      <main className="max-w-lg mx-auto px-4 py-20 space-y-8">
        <div className="space-y-3">
          <h2 className="text-4xl font-bold text-hoff-text-primary leading-tight">
            Safe in-person<br />payments.
          </h2>
          <p className="text-hoff-text-tertiary text-sm leading-relaxed">
            Funds are held on-chain until you confirm the handoff in person.
            Share a link — buyer pays — you get the code — deal done.
          </p>
        </div>

        <Button fullWidth onClick={() => navigate('/create')}>
          Create a HandOff
        </Button>

        <p className="text-xs text-hoff-text-tertiary text-center">
          Buying? Open the link your seller sent you.
        </p>
      </main>
    </Layout>
  )
}
