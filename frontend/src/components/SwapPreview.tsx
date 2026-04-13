import { useState } from 'react'
import { formatUnits } from 'viem'
import { useUniswapQuote } from '@/hooks/useUniswapQuote'
import { TOKENS, type TokenKey } from '@/lib/tokens'
import type { Address } from '@/lib/types'
import { Spinner } from '@/components/ui/Spinner'

interface SwapPreviewProps {
  /** Input token the buyer holds (e.g. "USDC") */
  inputTokenKey: TokenKey
  /** Amount the deal requires, in wei of the payout token */
  amountOutWei: bigint
  /** Payout token address (null = native ETH) */
  payoutToken?: Address | null
  /** Current slippage tolerance in percent (default 0.5) */
  slippage?: number
  onSlippageChange?: (s: number) => void
}

const SLIPPAGE_OPTIONS = [0.1, 0.5, 1.0]

/**
 * Shows a swap quote summary (input amount, gas, slippage) before the buyer
 * triggers fundWithSwap(). Does not execute the swap itself — that is done
 * by the parent via useSwapAndDeposit.
 */
export function SwapPreview({
  inputTokenKey,
  amountOutWei,
  payoutToken = null,
  slippage = 0.5,
  onSlippageChange,
}: SwapPreviewProps) {
  const [showSlippage, setShowSlippage] = useState(false)

  const { quotedIn, isLoading, error } = useUniswapQuote(inputTokenKey, amountOutWei, payoutToken, slippage)

  const inputToken = TOKENS[inputTokenKey]

  if (isLoading) {
    return (
      <div className="bg-hoff-surface rounded-2xl p-4 flex items-center gap-3">
        <Spinner />
        <span className="text-xs text-hoff-text-tertiary">Fetching quote…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-hoff-surface rounded-2xl p-4">
        <p className="text-xs text-red-400">Could not fetch swap quote: {error}</p>
      </div>
    )
  }

  if (!quotedIn || !inputToken) return null

  const formattedIn = formatUnits(quotedIn, inputToken.decimals)

  return (
    <div className="bg-hoff-surface rounded-2xl p-4 space-y-3">
      {/* Swap summary row */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">
          Swap Preview
        </p>
        <button
          onClick={() => setShowSlippage(v => !v)}
          className="text-xs text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors"
        >
          ⚙ Slippage {slippage}%
        </button>
      </div>

      {/* Slippage picker */}
      {showSlippage && onSlippageChange && (
        <div className="flex gap-1.5">
          {SLIPPAGE_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => { onSlippageChange(opt); setShowSlippage(false) }}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                slippage === opt
                  ? 'bg-hoff-accent text-hoff-bg'
                  : 'bg-hoff-elevated text-hoff-text-tertiary hover:text-hoff-text-secondary'
              }`}
            >
              {opt}%
            </button>
          ))}
        </div>
      )}

      {/* Quote figures */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-hoff-text-tertiary">You pay (approx.)</span>
          <span className="text-sm font-mono font-semibold text-hoff-text-primary">
            {formattedIn} {inputToken.symbol}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-hoff-text-tertiary">Max slippage</span>
          <span className="text-xs text-hoff-text-secondary">{slippage}%</span>
        </div>
      </div>

      <p className="text-xs text-hoff-text-tertiary">
        Quote is live and refreshed automatically. Final amount may vary slightly.
      </p>
    </div>
  )
}
