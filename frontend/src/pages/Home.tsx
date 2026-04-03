import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { MOCK_MODE, MOCK_DEAL_ID } from '@/lib/mock'

// Home — seller landing page.
// Buyers arrive via direct /pay/:dealId link — no choice screen needed.

export default function Home() {
  const navigate = useNavigate()

  return (
    <Layout>
      {MOCK_MODE && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <div className="flex items-center justify-between gap-3 bg-hoff-elevated border border-hoff-accent/30 rounded-xl px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-hoff-accent animate-pulse shrink-0" />
              <span className="text-xs font-medium text-hoff-accent">Mock mode — no wallet needed</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => navigate(`/view/${MOCK_DEAL_ID}`)}
                className="text-xs text-hoff-text-secondary hover:text-hoff-accent transition-colors font-mono"
              >
                View Deal →
              </button>
            </div>
          </div>
        </div>
      )}

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
