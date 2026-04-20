import { useState } from 'react'
import { parseContractError } from '@/lib/errors'

interface ErrorBannerProps {
  /** Raw error object. If the user cancelled in their wallet, nothing renders. */
  error?: Error | unknown
  /** Plain message — use when you already have a final string (form validation etc.). */
  message?: string
}

export function ErrorBanner({ error, message }: ErrorBannerProps) {
  const [showDetails, setShowDetails] = useState(false)

  // Priority: explicit message > parsed error
  const friendly = message ?? (error ? parseContractError(error) : null)
  if (!friendly) return null

  // Raw details only shown when we actually have an error object
  const raw = error ? extractRaw(error) : null
  const hasDetails = !!raw && raw !== friendly

  return (
    <div className="bg-hoff-err-bg border border-hoff-err/20 rounded-xl px-4 py-3">
      <div className="flex items-start gap-2.5 text-hoff-err">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0 mt-0.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p className="text-sm leading-snug flex-1">{friendly}</p>
      </div>

      {hasDetails && (
        <>
          <button
            type="button"
            onClick={() => setShowDetails(v => !v)}
            className="mt-2 flex items-center gap-1 text-[11px] text-hoff-err/70 hover:text-hoff-err transition-colors"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className={`transition-transform ${showDetails ? 'rotate-90' : ''}`}
            >
              <polyline points="9 6 15 12 9 18"/>
            </svg>
            {showDetails ? 'Hide details' : 'Show details'}
          </button>

          {showDetails && (
            <pre className="mt-2 text-[10px] font-mono text-hoff-err/70 bg-hoff-err-bg/40 border border-hoff-err/10 rounded-lg p-2 whitespace-pre-wrap break-all max-h-40 overflow-auto">
              {raw}
            </pre>
          )}
        </>
      )}
    </div>
  )
}

function extractRaw(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  try { return JSON.stringify(error, null, 2) } catch { return String(error) }
}
