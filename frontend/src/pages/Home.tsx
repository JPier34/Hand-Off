import { useNavigate } from 'react-router-dom'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'

// Home — seller landing page.
// Buyers arrive via direct /pay/:dealId link — no choice screen needed.

export default function Home() {
  const navigate = useNavigate()
  const { isAuthenticated, login } = useDynamicAuth()

  return (
    <Layout>
      <main className="w-full px-4 sm:max-w-md sm:mx-auto py-8 space-y-8">
        <div className="space-y-3">
          <h2 className="text-4xl font-bold text-hoff-text-primary leading-tight">
            Safe in-person<br />payments.
          </h2>
          <p className="text-hoff-text-tertiary text-sm leading-relaxed">
            Funds are held on-chain until you confirm the handoff in person.
            Share a link — buyer pays — you get the code — deal done.
          </p>
        </div>

        <Button fullWidth onClick={() => isAuthenticated ? navigate('/create') : login()}>
          {isAuthenticated ? 'Create a HandOff' : 'Connect Wallet'}
        </Button>

        {isAuthenticated && (
          <button
            onClick={() => navigate('/history')}
            className="w-full text-sm text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors text-center"
          >
            View my deals →
          </button>
        )}

        <p className="text-xs text-hoff-text-tertiary text-center">
          Buying? Open the link your seller sent you.
        </p>
      </main>
    </Layout>
  )
}
