import { useNavigate } from 'react-router-dom'
import { WalletButton } from './WalletButton'
import { AuthModal } from './AuthModal'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'
import { useTheme } from '@/hooks/useTheme'

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { isAuthenticated } = useDynamicAuth()
  const { theme, toggle } = useTheme()

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
            <button
              onClick={toggle}
              className="w-9 h-9 rounded-full bg-hoff-elevated border border-hoff-brand hover:border-hoff-accent/40 flex items-center justify-center text-hoff-text-secondary transition-colors"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
            {isAuthenticated && (
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
            <WalletButton />
          </div>
        </div>
      </header>
      <div className="flex-1 flex flex-col justify-center">
        {children}
      </div>
      <AuthModal />
    </div>
  )
}
