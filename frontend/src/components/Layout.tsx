import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { DynamicWidget } from '@dynamic-labs/sdk-react-core'
import { MOCK_MODE } from '@/lib/mock'

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { isConnected } = useAccount()

  return (
    <div className="hoff-page-bg min-h-screen flex flex-col">
      <header className="px-6 py-4 shrink-0">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-hoff-text-primary font-bold text-lg tracking-tight"
          >
            <img src="/logo-icon.png" alt="" className="h-7 w-7" />
            <span>
              <span className="text-hoff-text-primary">Hand</span>
              <span className="text-hoff-accent">Off</span>
            </span>
          </button>

          <div className="flex items-center gap-3">
            {(isConnected || MOCK_MODE) && (
              <button
                onClick={() => navigate('/create')}
                className="w-9 h-9 rounded-full bg-hoff-accent hover:bg-hoff-accent-hover flex items-center justify-center text-white transition-colors"
                aria-label="Create new escrow"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            )}
            <DynamicWidget variant="dropdown" />
          </div>
        </div>
      </header>
      <div className="flex-1 flex flex-col justify-center">
        {children}
      </div>
    </div>
  )
}
