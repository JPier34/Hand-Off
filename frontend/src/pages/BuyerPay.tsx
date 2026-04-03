import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CountdownTimer } from '@/components/escrow/CountdownTimer'
import { useDealDetails } from '@/hooks/useEscrow'
import { useDepositFunds } from '@/hooks/useEscrowWrite'
import { generateUnlockCode, hashUnlockCode } from '@/lib/code-gen'
import { EscrowStatus } from '@/lib/types'
import { MOCK_MODE } from '@/lib/mock'

const PROTOCOL_FEE_BPS = 10n   // 0.1%
const EST_GAS           = 800_000_000_000_000n // ~0.0008 ETH placeholder

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

      {/* Checkmark */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="w-16 h-16 rounded-full bg-hoff-accent/20 border-2 border-hoff-accent flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2EBF7A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-hoff-text-primary text-center">HandOff Funded</h1>
      </div>

      {/* Description + date row */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-hoff-text-tertiary truncate">
          {description || `Unlabelled #${dealIdParam}`}
        </span>
        <span className="text-xs text-hoff-text-tertiary shrink-0 ml-2">
          Created {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </span>
      </div>

      {/* Code card */}
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

        {/* Code tiles */}
        <div className="flex justify-center gap-3">
          {code.split('').map((char, i) => (
            <div
              key={i}
              className="w-14 h-16 bg-hoff-elevated rounded-xl flex items-center justify-center text-3xl font-mono font-bold text-hoff-text-primary"
            >
              {char}
            </div>
          ))}
        </div>

        <p className="text-xs text-hoff-text-tertiary text-center">
          Only share this in person at the handoff
        </p>
      </div>

      {/* Etherscan link */}
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

      {/* Review section */}
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
              {/* Triangle down */}
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

  // ─── Guard (before any hooks) ───────────────────────────────────────────────
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

  // ─── Hooks ──────────────────────────────────────────────────────────────────
  const { details, isLoading, isError }                                   = useDealDetails(dealId)
  const { deposit, isPending, isConfirming, isSuccess, isError: txError } = useDepositFunds(dealId)

  // ─── Action ─────────────────────────────────────────────────────────────────
  function handleDeposit() {
    if (!details) return
    const code = generateUnlockCode()
    setUnlockCode(code)
    deposit(formatEther(details.amount), hashUnlockCode(code))
  }

  // ─── Completed screen ────────────────────────────────────────────────────────
  if (isSuccess && unlockCode) {
    return (
      <Layout>
        <CompletedView
          code={unlockCode}
          description={details?.description ?? ''}
          dealIdParam={dealIdParam}
          onSubmitReview={() => {
            // In mock mode reset state and navigate home after a short delay
            if (MOCK_MODE) setTimeout(() => navigate('/'), 800)
          }}
        />
      </Layout>
    )
  }

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      </Layout>
    )
  }

  // ─── Fee calc (only when details available) ──────────────────────────────────
  const protocolFee = details ? (details.amount * PROTOCOL_FEE_BPS) / 10_000n : 0n
  const total       = details ? details.amount + protocolFee + EST_GAS : 0n

  return (
    <Layout>
      <main className="max-w-sm mx-auto px-4 py-4 space-y-3">

        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(`/deal/${dealIdParam}`)}
            className="flex items-center gap-1.5 text-xs text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            View Existing · Buyer
          </button>
          <span className="flex items-center gap-1.5 text-xs font-medium text-hoff-accent bg-hoff-accent-muted px-2.5 py-1 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-hoff-accent shrink-0" />
            #{dealIdParam} deals
          </span>
        </div>

        {isError || !details ? (
          <div className="bg-hoff-surface rounded-2xl p-5">
            <p className="text-sm text-red-400">Could not load deal. Check the link and try again.</p>
          </div>
        ) : (
          <>
            {/* Title + status */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
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

            {/* Amount + fee breakdown card */}
            <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
              <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">
                Amount
              </p>

              {/* Big amount */}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-5xl font-bold text-hoff-text-primary tabular-nums">
                  {formatEther(details.amount)}
                </span>
                <span className="text-xl font-medium text-hoff-text-secondary shrink-0">ETH</span>
              </div>

              {/* Fee breakdown */}
              <div className="space-y-0.5 pt-1 border-t border-hoff-brand">
                <FeeRow
                  label="Escrow Amount"
                  value={`${formatEther(details.amount)} ETH`}
                />
                <FeeRow
                  label="Protocol Fee (0.1%)"
                  value={`${formatEther(protocolFee)} ETH`}
                />
                <FeeRow
                  label="Est. Gas"
                  value={`~${formatEther(EST_GAS)} ETH`}
                />
                <div className="border-t border-hoff-brand pt-1 mt-1">
                  <FeeRow
                    label="Total"
                    value={`${formatEther(total)} ETH`}
                    highlight
                  />
                </div>
              </div>

              {/* Expires row */}
              <div className="flex items-center justify-between pt-1 border-t border-hoff-brand">
                <span className="text-xs text-hoff-text-tertiary">Expires in</span>
                <CountdownTimer expiresAt={Number(details.expiresAt) * 1000} />
              </div>
            </div>

            {/* Creator + reputation card */}
            <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-hoff-elevated flex items-center justify-center text-hoff-text-secondary text-xs font-bold shrink-0">
                  {details.seller.slice(2, 4).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-hoff-text-tertiary mb-0.5">Creator</p>
                  <p className="text-sm text-hoff-text-primary font-mono truncate">
                    {details.seller.slice(0, 6)}...{details.seller.slice(-4)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-hoff-brand">
                <span className="text-xs text-hoff-text-tertiary">Reputation</span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <svg key={i} width="12" height="12" viewBox="0 0 24 24"
                      fill={i <= 4 ? '#2EBF7A' : 'none'}
                      stroke="#2EBF7A" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  ))}
                  <span className="text-xs text-hoff-text-tertiary ml-1.5">4.0</span>
                </div>
              </div>
            </div>

            {/* TX state feedback */}
            {isPending && (
              <div className="flex items-center gap-2 text-amber-400 bg-amber-900/20 px-4 py-3 rounded-xl border border-amber-800/30">
                <Spinner size="sm" />
                <span className="text-sm">Confirm in your wallet app</span>
              </div>
            )}
            {isConfirming && (
              <div className="flex items-center gap-2 text-hoff-accent bg-hoff-accent-muted px-4 py-3 rounded-xl">
                <Spinner size="sm" />
                <span className="text-sm">Processing on-chain...</span>
              </div>
            )}
            {txError && (
              <div className="text-red-400 bg-red-900/20 px-4 py-3 rounded-xl text-sm border border-red-800/30">
                Payment failed. Try again.
              </div>
            )}

            {/* CTA */}
            {details.status === EscrowStatus.PENDING && (
              <Button
                fullWidth
                onClick={isConnected ? handleDeposit : undefined}
                loading={isPending || isConfirming}
                disabled={isPending || isConfirming}
              >
                {isConnected ? 'Fund Escrow' : 'Connect Wallet To Continue'}
              </Button>
            )}

            {details.status === EscrowStatus.FUNDED && (
              <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl px-4 py-3">
                <p className="text-sm text-amber-400 text-center">This escrow has already been funded.</p>
              </div>
            )}

            {/* Footer */}
            <p className="text-xs text-hoff-text-tertiary text-center pb-4">
              Funds will be held in escrow until both parties confirm
            </p>
          </>
        )}

      </main>
    </Layout>
  )
}
