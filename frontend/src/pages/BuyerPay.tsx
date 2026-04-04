import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { formatEther, formatUnits } from 'viem'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CountdownTimer } from '@/components/escrow/CountdownTimer'
import { useDealDetails } from '@/hooks/useEscrow'
import { useDepositFunds, useClaimRefund } from '@/hooks/useEscrowWrite'
import { useQuote, useSwapAndDeposit } from '@/hooks/useTokenSwap'
import { generateUnlockCode, hashUnlockCode } from '@/lib/code-gen'
import { EscrowStatus } from '@/lib/types'
import { MOCK_MODE, mockExpire } from '@/lib/mock'
import { IntroScreen } from '@/components/escrow/IntroScreen'
import { TOKENS, TOKEN_KEYS, type TokenKey, payoutSymbol, payoutDecimals } from '@/lib/tokens'
import { useUsdValue } from '@/hooks/useTokenPrice'
import { EnsName } from '@/components/EnsName'

const PROTOCOL_FEE_BPS  = 10n   // 0.1%
const EST_GAS           = 800_000_000_000_000n // ~0.0008 ETH placeholder
const DEFAULT_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function isValidDealId(param: string | undefined): param is string {
  if (!param) return false
  const n = Number(param)
  return Number.isInteger(n) && n > 0
}

function FeeRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className={`text-xs ${highlight ? 'text-hoff-text-secondary font-medium' : 'text-hoff-text-tertiary'}`}>
        {label}
      </span>
      <span className={`text-xs font-mono ${highlight ? 'text-hoff-text-primary font-semibold' : 'text-hoff-text-secondary'}`}>
        {value}
      </span>
    </div>
  )
}

// ─── Expiry progress bar ──────────────────────────────────────────────────────

function ExpiryBar({ expiresAt, totalMs }: { expiresAt: number; totalMs: number }) {
  const remaining = Math.max(0, expiresAt - Date.now())
  const fraction = Math.min(1, remaining / totalMs)
  const color = fraction > 0.25 ? 'bg-hoff-accent' : fraction > 0 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="h-1.5 w-full rounded-full bg-hoff-elevated overflow-hidden">
      <div
        className={`h-full rounded-full ${color} transition-all`}
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  )
}

// ─── Token selector ───────────────────────────────────────────────────────────

interface TokenSelectorProps {
  selected: TokenKey
  onChange: (key: TokenKey) => void
}

function TokenSelector({ selected, onChange }: TokenSelectorProps) {
  // Measure width dynamically based on selected symbol length
  const charWidth = TOKENS[selected]?.symbol.length ?? 3
  const width = `${charWidth * 0.7 + 1.2}em`

  return (
    <select
      value={selected}
      onChange={e => onChange(e.target.value)}
      className="shrink-0 h-8 px-2 rounded-lg bg-hoff-accent-muted text-hoff-accent text-xl font-medium appearance-none [&::-ms-expand]:hidden cursor-pointer focus:outline-none transition-colors text-center"
      style={{ width, WebkitAppearance: 'none', MozAppearance: 'none' }}
    >
      {TOKEN_KEYS.map(key => (
        <option key={key} value={key} className="bg-hoff-elevated text-hoff-text-primary">
          {TOKENS[key].symbol}
        </option>
      ))}
    </select>
  )
}

// ─── Swap preview card ────────────────────────────────────────────────────────

interface SwapPreviewProps {
  tokenKey: TokenKey
  quotedIn: bigint | undefined
  amountOutWei: bigint
  isLoading: boolean
  error: string | null
}

function SwapPreview({ tokenKey, quotedIn, amountOutWei, isLoading, error }: SwapPreviewProps) {
  if (tokenKey === 'ETH') return null

  const token = TOKENS[tokenKey]

  return (
    <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
      <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">
        Swap Preview
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 py-2">
          <Spinner size="sm" />
          <span className="text-sm text-hoff-text-tertiary">Getting quote...</span>
        </div>
      )}

      {error && (
        <div className="text-red-400 bg-red-900/20 px-4 py-3 rounded-xl text-sm border border-red-800/30">
          {error}
        </div>
      )}

      {!isLoading && !error && quotedIn !== undefined && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-hoff-text-tertiary mb-0.5">You pay</p>
              <p className="text-lg font-bold text-hoff-text-primary">
                {formatUnits(quotedIn, token.decimals)} {token.symbol}
              </p>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7B7B" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
            <div className="text-right">
              <p className="text-xs text-hoff-text-tertiary mb-0.5">Seller receives</p>
              <p className="text-lg font-bold text-hoff-text-primary">
                {formatEther(amountOutWei)} ETH
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-hoff-brand">
            <span className="text-xs text-hoff-text-tertiary">Slippage tolerance</span>
            <span className="text-xs text-hoff-text-secondary">0.5%</span>
          </div>

          <p className="text-xs text-hoff-text-tertiary">
            Powered by Uniswap. Your {token.symbol} will be swapped to ETH and deposited into the escrow.
          </p>
        </>
      )}

      {!isLoading && !error && quotedIn === undefined && (
        <p className="text-sm text-hoff-text-tertiary py-2">
          No swap route available — try a different token or fund directly with ETH.
        </p>
      )}
    </div>
  )
}

// ─── Completed screen ─────────────────────────────────────────────────────────

interface CompletedViewProps {
  code: string
  description: string
  dealIdParam: string
  onSubmitReview: (vote: 'positive' | 'negative') => void
}

function CompletedView({ code, description, dealIdParam, onSubmitReview }: CompletedViewProps) {
  const [review, setReview] = useState<'positive' | 'negative' | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const etherscanBase = 'https://sepolia.basescan.org/tx/'
  const etherscanHref = MOCK_MODE
    ? `${etherscanBase}0x0000000000000000000000000000000000000000000000000000000000000000`
    : etherscanBase

  function handleSubmit() {
    if (!review) return
    onSubmitReview(review)
    setSubmitted(true)
  }

  return (
    <main className="max-w-sm mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="w-16 h-16 rounded-full bg-hoff-accent/20 border-2 border-hoff-accent flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2EBF7A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-hoff-text-primary text-center">HandOff Funded</h1>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-hoff-text-tertiary truncate">
          {description || `Unlabelled #${dealIdParam}`}
        </span>
        <span className="text-xs text-hoff-text-tertiary shrink-0 ml-2">
          Created {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </span>
      </div>

      <div className="bg-hoff-surface rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-hoff-text-secondary">4-Digit Unlock Code</span>
          <button
            className="w-6 h-6 rounded-full border border-hoff-text-tertiary/40 flex items-center justify-center text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors"
            aria-label="What is this code?"
            title="Show this code to the seller in person. They will enter it to release the funds."
          >
            <span className="text-xs font-semibold">?</span>
          </button>
        </div>
        <div className="flex justify-center gap-3">
          {code.split('').map((char, i) => (
            <div key={i} className="w-14 h-16 bg-hoff-elevated rounded-xl flex items-center justify-center text-3xl font-mono font-bold text-hoff-text-primary">
              {char}
            </div>
          ))}
        </div>
        <p className="text-xs text-hoff-text-tertiary text-center">
          Only share this in person at the handoff
        </p>
      </div>

      <a
        href={etherscanHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full h-12 rounded-xl border border-hoff-text-tertiary/30 text-sm text-hoff-text-secondary hover:text-hoff-text-primary hover:border-hoff-text-secondary/50 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        View on Etherscan
      </a>

      {!submitted ? (
        <div className="space-y-3">
          <p className="text-sm text-hoff-text-tertiary text-center">Leave a Review – How did it go?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setReview('positive')}
              className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-2 border transition-all ${
                review === 'positive'
                  ? 'bg-hoff-accent/20 border-hoff-accent text-hoff-accent'
                  : 'bg-hoff-surface border-hoff-surface text-hoff-text-secondary hover:border-hoff-accent/40'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M12 5L20 19H4L12 5Z" fill={review === 'positive' ? '#2EBF7A' : 'none'} stroke={review === 'positive' ? '#2EBF7A' : '#6B7B7B'} strokeWidth="2" strokeLinejoin="round"/>
              </svg>
              <span className="text-xs font-medium">Positive</span>
            </button>
            <button
              onClick={() => setReview('negative')}
              className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-2 border transition-all ${
                review === 'negative'
                  ? 'bg-red-900/30 border-red-500 text-red-400'
                  : 'bg-hoff-surface border-hoff-surface text-hoff-text-secondary hover:border-red-500/40'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M12 19L4 5H20L12 19Z" fill={review === 'negative' ? '#f87171' : 'none'} stroke={review === 'negative' ? '#f87171' : '#6B7B7B'} strokeWidth="2" strokeLinejoin="round"/>
              </svg>
              <span className="text-xs font-medium">Negative</span>
            </button>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!review}
            className="w-full h-12 rounded-xl bg-hoff-accent text-hoff-bg font-bold text-sm disabled:opacity-40 hover:bg-hoff-accent-hover transition-colors"
          >
            Submit
          </button>
        </div>
      ) : (
        <div className="bg-hoff-accent/10 border border-hoff-accent/30 rounded-xl px-4 py-3 text-center">
          <p className="text-sm text-hoff-accent font-medium">Thanks for your review!</p>
        </div>
      )}
    </main>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function BuyerPay() {
  const { dealId: dealIdParam } = useParams<{ dealId: string }>()
  const navigate = useNavigate()
  const { isConnected } = useAccount()
  const [unlockCode, setUnlockCode] = useState<string | null>(null)
  const [selectedToken, setSelectedToken] = useState<TokenKey>('ETH')
  const [showIntro, setShowIntro] = useState(true)

  // ─── Guard ──────────────────────────────────────────────────────────────────
  if (!isValidDealId(dealIdParam)) {
    return (
      <Layout>
        <main className="max-w-sm mx-auto px-4 py-6">
          <div className="bg-hoff-surface rounded-2xl p-5">
            <p className="text-sm text-red-400">Invalid deal link. Check the URL and try again.</p>
          </div>
        </main>
      </Layout>
    )
  }

  const dealId = BigInt(dealIdParam)
  const canAct = isConnected || MOCK_MODE

  // ─── Hooks (always called, rules of hooks) ─────────────────────────────────
  const { details, isLoading, isError, escrowAddress }                     = useDealDetails(dealId)
  const { deposit, isPending, isConfirming, isSuccess, isError: txError } = useDepositFunds(dealId, escrowAddress)
  const refund = useClaimRefund(dealId, escrowAddress)

  const amountWei = details?.amount ?? 0n
  const usdValue  = useUsdValue(amountWei, details?.payoutToken ?? null)
  const { quotedIn, isLoading: quoteLoading, error: quoteError }         = useQuote(selectedToken, amountWei)
  const swap                                                              = useSwapAndDeposit(dealId, selectedToken)

  const isSwapPath = selectedToken !== 'ETH'

  // Determine overall success from either direct deposit or swap path
  const fundingSuccess = isSwapPath ? swap.isSuccess : isSuccess

  // Expired detection (UC-9 / UC-17)
  const isExpired = !!(details && details.status === EscrowStatus.FUNDED &&
    Date.now() > Number(details.expiresAt) * 1000)

  // ─── Actions ────────────────────────────────────────────────────────────────
  function handleDeposit() {
    if (!details) return
    const code = generateUnlockCode()
    setUnlockCode(code)

    if (isSwapPath) {
      swap.swapAndDeposit(hashUnlockCode(code))
    } else {
      deposit(formatEther(details.amount), hashUnlockCode(code))
    }
  }

  // ─── Completed screen ──────────────────────────────────────────────────────
  if (fundingSuccess && unlockCode) {
    return (
      <Layout>
        <CompletedView
          code={unlockCode}
          description={details?.description ?? ''}
          dealIdParam={dealIdParam}
          onSubmitReview={() => {
            if (MOCK_MODE) setTimeout(() => navigate('/'), 800)
          }}
        />
      </Layout>
    )
  }

  // ─── Intro screen ──────────────────────────────────────────────────────────
  if (showIntro) {
    return (
      <Layout>
        <IntroScreen onContinue={() => setShowIntro(false)} />
      </Layout>
    )
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24"><Spinner /></div>
      </Layout>
    )
  }

  // ─── Token display helpers ───────────────────────────────────────────────────
  const sym  = details ? payoutSymbol(details.payoutToken) : 'ETH'
  const dec  = details ? payoutDecimals(details.payoutToken) : 18
  const fmt  = (v: bigint) => formatUnits(v, dec)

  // ─── Fee calc ───────────────────────────────────────────────────────────────
  const protocolFee = details ? (details.amount * PROTOCOL_FEE_BPS) / 10_000n : 0n
  const total       = details ? details.amount + protocolFee + EST_GAS : 0n

  // ─── TX state helpers ───────────────────────────────────────────────────────
  const anyPending    = isSwapPath ? (swap.isApprovePending || swap.isSwapPending) : isPending
  const anyConfirming = isSwapPath ? (swap.isApproveConfirming || swap.isSwapConfirming) : isConfirming
  const anyError      = isSwapPath ? swap.isError : txError
  const anyBusy       = anyPending || anyConfirming

  // CTA label
  function ctaLabel(): string {
    if (!canAct) return 'Connect Wallet To Continue'
    if (isSwapPath && quotedIn !== undefined) {
      const token = TOKENS[selectedToken]
      return `Pay ${formatUnits(quotedIn, token.decimals)} ${token.symbol}`
    }
    return 'Fund Escrow'
  }

  // TX phase message
  function txMessage(): string | null {
    if (isSwapPath) {
      if (swap.isApprovePending) return 'Approve token in your wallet…'
      if (swap.isApproveConfirming) return 'Waiting for approval confirmation…'
      if (swap.isSwapPending) return 'Confirm swap + deposit in your wallet…'
      if (swap.isSwapConfirming) return 'Swapping and depositing on-chain…'
    } else {
      if (isPending) return 'Confirm in your wallet app'
      if (isConfirming) return 'Processing on-chain…'
    }
    return null
  }

  return (
    <Layout>
      <main className="max-w-sm mx-auto px-4 py-4 space-y-3">

        {isError || !details ? (
          <div className="bg-hoff-surface rounded-2xl p-5">
            <p className="text-sm text-red-400">Could not load deal. Check the link and try again.</p>
          </div>
        ) : (
          <>
            {/* Title + status */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-hoff-text-primary">Pay Escrow</h1>
                <StatusBadge status={details.status} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-hoff-text-tertiary truncate">
                  {details.description || 'Untitled'}
                </p>
                <p className="text-xs text-hoff-text-tertiary shrink-0">
                  Created {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Amount card */}
            <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
              <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">
                Amount Due
              </p>

              <div className="flex items-baseline justify-between gap-2">
                <span className="text-5xl font-bold text-hoff-text-primary tabular-nums">
                  {fmt(details.amount)}
                </span>
                {details.status === EscrowStatus.PENDING ? (
                  <TokenSelector selected={selectedToken} onChange={setSelectedToken} />
                ) : (
                  <span className="text-xl font-medium text-hoff-text-secondary shrink-0">
                    {sym}
                  </span>
                )}
              </div>

              <p className="text-xs text-hoff-text-tertiary">
                {usdValue ? `≈ $${usdValue} USD` : 'Fetching price...'}
              </p>
            </div>

            {/* Fee breakdown card */}
            <div className="bg-hoff-surface rounded-2xl p-5 space-y-1">
              <FeeRow label="Escrow Amount" value={`${fmt(details.amount)} ${sym}`} />
              <FeeRow label="Protocol Fee (0.1%)" value={`${fmt(protocolFee)} ${sym}`} />
              <FeeRow label="Est. Gas" value={`~${formatEther(EST_GAS)} ETH`} />
              <div className="border-t border-hoff-brand pt-1.5 mt-1.5">
                <FeeRow label="Total" value={`${fmt(total)} ${sym}`} highlight />
              </div>
            </div>

            {/* Expires row with progress bar */}
            <div className="bg-hoff-surface rounded-2xl px-5 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-hoff-text-tertiary">Expires in</span>
                <CountdownTimer expiresAt={Number(details.expiresAt) * 1000} />
              </div>
              <ExpiryBar expiresAt={Number(details.expiresAt) * 1000} totalMs={DEFAULT_TIMEOUT_MS} />
            </div>

            {/* Swap preview (only when non-ETH token selected) */}
            {details.status === EscrowStatus.PENDING && (
              <SwapPreview
                tokenKey={selectedToken}
                quotedIn={quotedIn}
                amountOutWei={amountWei}
                isLoading={quoteLoading}
                error={quoteError}
              />
            )}

            {/* Creator + reputation card */}
            <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-hoff-elevated flex items-center justify-center text-hoff-text-secondary text-xs font-bold shrink-0">
                  {details.seller.slice(2, 4).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-hoff-text-tertiary mb-0.5">Creator</p>
                  <EnsName
                    address={details.seller as `0x${string}`}
                    className="text-sm text-hoff-text-primary font-mono truncate block"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-hoff-brand">
                <span className="text-xs text-hoff-text-tertiary">Completed HandOffs</span>
                <span className="text-xs text-hoff-text-secondary font-medium">16</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-hoff-brand">
                <span className="text-xs text-hoff-text-tertiary">Reputation</span>
                <div className="flex items-center gap-3">
                  {/* Positive */}
                  <div className="flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24">
                      <path d="M12 5L20 19H4L12 5Z" fill="#2EBF7A" stroke="#2EBF7A" strokeWidth="2" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-xs text-hoff-text-secondary">12</span>
                  </div>
                  {/* Neutral */}
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-0.5 rounded-full bg-hoff-text-tertiary inline-block" />
                    <span className="text-xs text-hoff-text-secondary">3</span>
                  </div>
                  {/* Negative */}
                  <div className="flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24">
                      <path d="M12 19L4 5H20L12 19Z" fill="#f87171" stroke="#f87171" strokeWidth="2" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-xs text-hoff-text-secondary">1</span>
                  </div>
                </div>
              </div>
            </div>

            {/* TX state feedback */}
            {txMessage() && (
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${
                anyPending
                  ? 'text-amber-400 bg-amber-900/20 border border-amber-800/30'
                  : 'text-hoff-accent bg-hoff-accent-muted'
              }`}>
                <Spinner size="sm" />
                <span className="text-sm">{txMessage()}</span>
              </div>
            )}
            {anyError && (
              <div className="text-red-400 bg-red-900/20 px-4 py-3 rounded-xl text-sm border border-red-800/30">
                Payment failed. Try again.
              </div>
            )}

            {/* CTA */}
            {details.status === EscrowStatus.PENDING && (
              <Button
                fullWidth
                onClick={canAct ? handleDeposit : undefined}
                loading={anyBusy}
                disabled={anyBusy || (isSwapPath && quotedIn === undefined && !quoteLoading)}
              >
                {ctaLabel()}
              </Button>
            )}

            {/* FUNDED — not expired */}
            {details.status === EscrowStatus.FUNDED && !isExpired && (
              <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl px-4 py-3">
                <p className="text-sm text-amber-400 text-center">This escrow has already been funded.</p>
              </div>
            )}

            {/* FUNDED + expired — UC-9: Claim Refund */}
            {isExpired && (
              <div className="space-y-3">
                <div className="bg-red-900/20 border border-red-800/30 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-sm text-red-400 font-medium text-center">This HandOff has expired</p>
                  <p className="text-xs text-red-400/70 text-center">
                    The seller did not enter the code in time. You can reclaim your funds.
                  </p>
                </div>

                {refund.isPending && (
                  <div className="flex items-center gap-2 text-amber-400 bg-amber-900/20 px-4 py-3 rounded-xl border border-amber-800/30">
                    <Spinner size="sm" />
                    <span className="text-sm">Confirm refund in your wallet…</span>
                  </div>
                )}
                {refund.isConfirming && (
                  <div className="flex items-center gap-2 text-hoff-accent bg-hoff-accent-muted px-4 py-3 rounded-xl">
                    <Spinner size="sm" />
                    <span className="text-sm">Refund processing on-chain…</span>
                  </div>
                )}
                {refund.isError && (
                  <div className="text-red-400 bg-red-900/20 px-4 py-3 rounded-xl text-sm border border-red-800/30">
                    Refund failed. Try again.
                  </div>
                )}

                {!refund.isSuccess && (
                  <Button
                    fullWidth
                    variant="danger"
                    onClick={() => refund.claimRefund()}
                    loading={refund.isPending || refund.isConfirming}
                  >
                    Claim Refund — {fmt(details.amount)} {sym}
                  </Button>
                )}

                {refund.isSuccess && (
                  <div className="bg-hoff-accent/10 border border-hoff-accent/30 rounded-xl px-4 py-3 text-center space-y-1">
                    <p className="text-sm text-hoff-accent font-medium">Refund successful</p>
                    <p className="text-xs text-hoff-text-tertiary">{fmt(details.amount)} {sym} returned to your wallet</p>
                  </div>
                )}
              </div>
            )}

            {/* REFUNDED (already claimed, e.g. revisiting the page) */}
            {details.status === EscrowStatus.REFUNDED && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 pt-2">
                  <div className="w-14 h-14 rounded-full bg-hoff-elevated border-2 border-hoff-text-tertiary/40 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B7B7B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
                    </svg>
                  </div>
                  <p className="text-sm text-hoff-text-tertiary text-center">
                    This HandOff was refunded. Funds have been returned to the buyer.
                  </p>
                </div>
              </div>
            )}

            {/* CANCELED — UC-3: payment link inactive */}
            {details.status === EscrowStatus.CANCELED && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 pt-2">
                  <div className="w-14 h-14 rounded-full bg-red-900/30 border-2 border-red-500/40 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </div>
                  <p className="text-sm text-hoff-text-tertiary text-center">
                    This HandOff has been canceled by the seller.
                  </p>
                </div>
              </div>
            )}

            {/* Mock debug: simulate expiry — poll picks up the change within 500ms */}
            {MOCK_MODE && details.status === EscrowStatus.FUNDED && !isExpired && (
              <button
                onClick={() => mockExpire(dealId)}
                className="w-full text-xs text-hoff-text-tertiary hover:text-amber-400 transition-colors py-1 text-center"
              >
                [Mock] Simulate expiry
              </button>
            )}

            <p className="text-xs text-hoff-text-tertiary text-center pb-4">
              Funds will be held in escrow until both parties confirm
            </p>
          </>
        )}
      </main>
    </Layout>
  )
}
