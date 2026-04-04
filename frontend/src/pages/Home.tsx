import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { MOCK_MODE } from '@/lib/mock'

// Home — seller landing page.
// Buyers arrive via direct /pay/:dealId link — no choice screen needed.

function MockBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs bg-amber-900/40 text-amber-300 hover:text-amber-100 hover:bg-amber-800/50 px-2 py-1 rounded-md transition-colors font-mono"
    >
      {label}
    </button>
  )
}

const MOCK_DEALS = [
  { id: 42, label: '0.633 ETH · Pending · iPhone 14 Pro' },
  { id: 35, label: '1,200 USDC · Funded · MacBook Air M2' },
  { id: 22, label: '2,500 USDC · Funded · Rolex Submariner' },
  { id: 27, label: '350 DAI · Complete · Canon EOS R6' },
  { id: 25, label: '0.5 WETH · Complete · Herman Miller' },
  { id: 31, label: '50 USDC · Refunded · AirPods Pro' },
]

export default function Home() {
  const navigate = useNavigate()
  const { isConnected } = useAccount()
  const { setShowAuthFlow } = useDynamicContext()

  return (
    <Layout>
      {MOCK_MODE && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <div className="bg-amber-900/30 border border-amber-700/40 rounded-2xl p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Dev / Mock Mode</span>
            </div>
            <p className="text-xs text-amber-300/70">
              No wallet or contract needed. These links only appear when VITE_MOCK=true.
            </p>

            {/* Pages */}
            <div className="space-y-1.5">
              <p className="text-xs text-amber-400/60 font-semibold uppercase tracking-wider">Pages</p>
              <div className="flex flex-wrap gap-1.5">
                <MockBtn label="Create Deal" onClick={() => navigate('/create')} />
                <MockBtn label="History" onClick={() => navigate('/history')} />
              </div>
            </div>

            {/* Mock deals */}
            <div className="space-y-1.5">
              <p className="text-xs text-amber-400/60 font-semibold uppercase tracking-wider">Mock Deals</p>
              <div className="space-y-1">
                {MOCK_DEALS.map(d => (
                  <div key={d.id} className="flex items-center gap-1.5">
                    <span className="text-xs text-amber-300/50 font-mono w-7 shrink-0">#{d.id}</span>
                    <span className="text-xs text-amber-300/70 truncate flex-1">{d.label}</span>
                    <MockBtn label="Buyer" onClick={() => navigate(`/pay/${d.id}`)} />
                    <MockBtn label="Seller" onClick={() => navigate(`/deal/${d.id}`)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-8 space-y-8">
        <div className="space-y-3">
          <h2 className="text-4xl font-bold text-hoff-text-primary leading-tight">
            Safe in-person<br />payments.
          </h2>
          <p className="text-hoff-text-tertiary text-sm leading-relaxed">
            Funds are held on-chain until you confirm the handoff in person.
            Share a link — buyer pays — you get the code — deal done.
          </p>
        </div>

        <Button fullWidth onClick={() => isConnected ? navigate('/create') : setShowAuthFlow(true)}>
          {isConnected ? 'Create a HandOff' : 'Connect Wallet'}
        </Button>

        <p className="text-xs text-hoff-text-tertiary text-center">
          Buying? Open the link your seller sent you.
        </p>
      </main>
    </Layout>
  )
}
