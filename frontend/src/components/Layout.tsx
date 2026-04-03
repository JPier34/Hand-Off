import { useNavigate } from 'react-router-dom'
// TODO: replace with Dynamic connect button once @dynamic-labs-sdk is wired up
import { WrongNetworkBanner } from './WrongNetworkBanner'

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()

  return (
    <div className="hoff-page-bg">
      <WrongNetworkBanner />
      <header className="px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-hoff-text-primary font-bold text-lg tracking-tight"
          >
            <span className="text-hoff-text-primary">Hand</span>
            <span className="text-hoff-accent">Off</span>
          </button>

          <div className="flex items-center gap-3">
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
            {/* TODO: <DynamicWidget /> or equivalent once Dynamic is installed */}
            <button className="h-9 px-4 rounded-full bg-hoff-accent hover:bg-hoff-accent-hover text-white text-sm font-medium transition-colors">
              Connect
            </button>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
