import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { formatEther, formatUnits, parseEther } from 'viem'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CountdownTimer } from '@/components/escrow/CountdownTimer'
import { useDealDetails, parseDealParam } from '@/hooks/useEscrow'
import { useReleaseEscrow, useCancelDeal, useEditDeal, useSubmitReview } from '@/hooks/useEscrowWrite'
import { parseContractError } from '@/lib/errors'
import { EscrowStatus } from '@/lib/types'
import { MOCK_MODE } from '@/lib/mock'
import { IntroScreen } from '@/components/escrow/IntroScreen'
import { payoutSymbol, payoutDecimals } from '@/lib/tokens'
import { useUsdValue } from '@/hooks/useTokenPrice'
import { EnsName } from '@/components/EnsName'
import { useReputation } from '@/hooks/useReputation'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function isValidDealParam(param: string | undefined): param is string {
  if (!param) return false
  const { dealId, escrowAddress } = parseDealParam(param)
  return !!dealId || !!escrowAddress
}


function expiryProgress(expiresAtSec: bigint): number {
  const remainingMs = Number(expiresAtSec) * 1000 - Date.now()
  return Math.max(0, Math.min(100, (remainingMs / SEVEN_DAYS_MS) * 100))
}

// ─── Code input boxes ─────────────────────────────────────────────────────────

interface CodeInputProps {
  value: string[]
  onChange: (chars: string[]) => void
}

function CodeInputBoxes({ value, onChange }: CodeInputProps) {
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  function handleChange(idx: number, raw: string) {
    const char = raw.slice(-1).toUpperCase().replace(/[^A-Z0-9]/, '')
    if (!char) return
    const next = [...value]
    next[idx] = char
    onChange(next)
    if (idx < 3) refs[idx + 1].current?.focus()
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      const next = [...value]
      if (next[idx]) {
        next[idx] = ''
        onChange(next)
      } else if (idx > 0) {
        next[idx - 1] = ''
        onChange(next)
        refs[idx - 1].current?.focus()
      }
      e.preventDefault()
    }
  }

  return (
    <div className="flex justify-center gap-3">
      {value.map((char, i) => (
        <div key={i} className="relative w-14 h-16">
          <input
            ref={refs[i]}
            type="text"
            inputMode="text"
            maxLength={2}
            value={char}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            onFocus={e => e.target.select()}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            aria-label={`Code digit ${i + 1}`}
          />
          <div
            onClick={() => refs[i].current?.focus()}
            className={`w-full h-full rounded-xl flex items-center justify-center text-2xl font-mono font-bold cursor-text transition-colors
              ${char
                ? 'bg-hoff-elevated text-hoff-text-primary border border-hoff-accent/50'
                : 'bg-hoff-elevated text-hoff-text-tertiary border border-hoff-brand'
              }`}
          >
            {char || '–'}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── View Escrow (FUNDED overview) ────────────────────────────────────────────

interface ViewEscrowProps {
  dealIdParam: string
  amount: bigint
  expiresAt: bigint
  seller: string
  sellerEns: string   // forward ENS: stored on-chain at deal creation
  status: EscrowStatus
  description: string
  sym: string
  fmt: (v: bigint) => string
  usdLabel: string
  onUnlock: () => void
}

function ViewEscrowView({ dealIdParam, amount, expiresAt, seller, sellerEns, status, description, sym, fmt, usdLabel, onUnlock }: ViewEscrowProps) {
  const navigate = useNavigate()
  const { reputation } = useReputation(seller as `0x${string}`)
  const payLink = `${window.location.origin}/pay/${dealIdParam}`
  const progress = expiryProgress(expiresAt)

  function handleShare() {
    const text = `Pay me via HandOff: ${payLink}`
    if (typeof navigator.share !== 'undefined') {
      navigator.share({ title: 'HandOff Payment', text, url: payLink }).catch(() => {})
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(payLink).catch(() => {})
  }

  return (
    <main className="w-full px-4 sm:max-w-md sm:mx-auto py-4 space-y-3">

      {/* Title + status */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-hoff-text-primary">View Escrow</h1>
          <StatusBadge status={status} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-hoff-text-tertiary truncate">
            {description || `Unlabelled #${dealIdParam}`}
          </span>
          <span className="text-xs text-hoff-text-tertiary shrink-0">
            Created {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Amount card */}
      <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">
            Amount Due
          </p>
          <span className="text-xs font-semibold text-hoff-accent bg-hoff-accent-muted px-2.5 py-1 rounded-lg">
            {sym}
          </span>
        </div>

        <div>
          <span className="text-5xl font-bold text-hoff-text-primary tabular-nums">
            {fmt(amount)}
          </span>
          <p className="text-xs text-hoff-text-tertiary mt-1">{usdLabel}</p>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-hoff-text-tertiary">Expires in</span>
            <CountdownTimer expiresAt={Number(expiresAt) * 1000} />
          </div>
          <div className="h-1.5 bg-hoff-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-hoff-accent rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Creator + reputation card */}
      <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-hoff-elevated flex items-center justify-center text-hoff-text-secondary text-xs font-bold shrink-0">
            {seller.slice(2, 4).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-hoff-text-tertiary mb-0.5">Creator</p>
            {/* Forward ENS: seller's ENS name as stored on-chain at deal creation */}
            {sellerEns ? (
              <p className="text-sm text-hoff-text-primary font-medium truncate">{sellerEns}</p>
            ) : (
              /* Reverse ENS: resolve address → name via ENS registry */
              <EnsName
                address={seller as `0x${string}`}
                className="text-sm text-hoff-text-primary font-mono truncate block"
              />
            )}
          </div>
          <a
            href={MOCK_MODE
              ? `https://sepolia.basescan.org/address/${seller}`
              : `https://sepolia.basescan.org/address/${seller}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors shrink-0"
            aria-label="View on explorer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>

        <div className="space-y-2 pt-2 border-t border-hoff-brand">
          <div className="flex items-center justify-between">
            <span className="text-xs text-hoff-text-tertiary">Completed HandOffs</span>
            <span className="text-xs font-medium text-hoff-text-secondary">{reputation.sellerDealCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-hoff-text-tertiary">Volume</span>
            <span className="text-xs font-medium text-hoff-text-secondary">{formatEther(reputation.sellerTotalVolume)} ETH</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-hoff-text-tertiary">Reputation</span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-hoff-text-secondary font-medium">
                {reputation.sellerTotalReviews > 0
                  ? `${Math.round((reputation.sellerPositiveReviews / reputation.sellerTotalReviews) * 100)}%`
                  : '—'}
              </span>
              <span className="flex items-center gap-0.5 text-hoff-accent">
                <svg width="10" height="10" viewBox="0 0 24 24"><path d="M12 4L20 20H4L12 4Z" fill="#2EBF7A"/></svg>
                {reputation.sellerPositiveReviews}
              </span>
              <span className="flex items-center gap-0.5 text-hoff-text-tertiary">
                <svg width="10" height="10" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#4B5563"/></svg>
                {reputation.sellerTotalReviews - reputation.sellerPositiveReviews}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <Button fullWidth onClick={onUnlock}>
        Unlock With Code
      </Button>

      <button
        onClick={handleShare}
        className="w-full h-12 rounded-xl border border-hoff-brand text-hoff-text-secondary hover:bg-hoff-surface hover:text-hoff-text-primary transition-colors text-sm font-semibold flex items-center justify-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        Share HandOff
      </button>

      <button
        onClick={handleCopyLink}
        className="w-full text-xs text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors py-1 text-center"
      >
        Copy payment link
      </button>

      <button
        onClick={() => navigate(`/deal/${dealIdParam}`)}
        className="w-full text-xs text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors py-1 text-center"
      >
        Manage Escrow
      </button>

    </main>
  )
}

// ─── Claim Funds (code entry) ──────────────────────────────────────────────────

interface ClaimFundsProps {
  dealIdParam: string
  amount: bigint
  expiresAt: bigint
  description: string
  sym: string
  fmt: (v: bigint) => string
  usdLabel: string
  onBack: () => void
  onRelease: (code: string) => void
  isPending: boolean
  isConfirming: boolean
  isError: boolean
  error?: Error | null
}

function ClaimFundsView({
  dealIdParam, amount, expiresAt, description, sym, fmt, usdLabel,
  onBack, onRelease, isPending, isConfirming, isError, error,
}: ClaimFundsProps) {
  const [chars, setChars] = useState(['', '', '', ''])
  const progress = expiryProgress(expiresAt)
  const fullCode = chars.join('')
  const isComplete = fullCode.length === 4 && chars.every(c => c !== '')

  return (
    <main className="w-full px-4 sm:max-w-md sm:mx-auto py-4 space-y-3">

      {/* Back + title */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back
      </button>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-hoff-text-primary">Claim Funds</h1>
          <StatusBadge status={EscrowStatus.COMPLETED} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-hoff-text-tertiary truncate">
            {description || `Unlabelled #${dealIdParam}`}
          </span>
          <span className="text-xs text-hoff-text-tertiary shrink-0">
            Created {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* You will receive */}
      <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">
            You Will Receive
          </p>
          <span className="text-xs font-semibold text-hoff-accent bg-hoff-accent-muted px-2.5 py-1 rounded-lg">
            {sym}
          </span>
        </div>
        <div>
          <span className="text-5xl font-bold text-hoff-text-primary tabular-nums">
            {fmt(amount)}
          </span>
          <p className="text-xs text-hoff-text-tertiary mt-1">{usdLabel}</p>
        </div>
      </div>

      {/* Code input card */}
      <div className="bg-hoff-surface rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-hoff-text-secondary">Buyer's 4-Digit Code</p>
          <button
            className="w-6 h-6 rounded-full border border-hoff-text-tertiary/40 flex items-center justify-center text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors"
            title="Ask the buyer to show you their code. Enter it here to release the funds."
            aria-label="What is this code?"
          >
            <span className="text-xs font-semibold">?</span>
          </button>
        </div>

        <CodeInputBoxes value={chars} onChange={setChars} />
      </div>

      {/* Expiry progress */}
      <div className="bg-hoff-surface rounded-2xl px-5 py-4 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-hoff-text-tertiary">Expires in</span>
          <CountdownTimer expiresAt={Number(expiresAt) * 1000} />
        </div>
        <div className="h-1.5 bg-hoff-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-hoff-accent rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {isError && (() => { const msg = parseContractError(error); return msg ? <div className="bg-red-900/20 border border-red-800/30 rounded-xl px-4 py-3"><p className="text-sm text-red-400 text-center">{msg}</p></div> : null })()}

      <Button
        fullWidth
        onClick={() => onRelease(fullCode)}
        disabled={!isComplete || isPending || isConfirming}
        loading={isPending || isConfirming}
      >
        {isPending ? 'Confirm in wallet…' : isConfirming ? 'Releasing funds…' : 'Claim Funds'}
      </Button>

    </main>
  )
}

// ─── Completed view ────────────────────────────────────────────────────────────

interface CompletedProps {
  dealIdParam: string
  amount: bigint
  description: string
  sym: string
  fmt: (v: bigint) => string
  usdLabel: string
  onSubmitReview?: (isPositive: boolean) => void
}

function CompletedView({ dealIdParam, amount, description, sym, fmt, usdLabel, onSubmitReview }: CompletedProps) {
  const [review, setReview] = useState<'positive' | 'negative' | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const etherscanBase = 'https://sepolia.basescan.org/tx/'
  const etherscanHref = MOCK_MODE
    ? `${etherscanBase}0x0000000000000000000000000000000000000000000000000000000000000000`
    : etherscanBase

  return (
    <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6 space-y-5">

      {/* Checkmark */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="w-16 h-16 rounded-full bg-hoff-accent/20 border-2 border-hoff-accent flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2EBF7A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-hoff-text-primary text-center">HandOff Completed</h1>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-hoff-text-tertiary truncate">
          {description || `Unlabelled #${dealIdParam}`}
        </span>
        <span className="text-xs text-hoff-text-tertiary shrink-0 ml-2">
          Created {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </span>
      </div>

      {/* Amount received */}
      <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">
            You Will Receive
          </p>
          <span className="text-xs font-semibold text-hoff-accent bg-hoff-accent-muted px-2.5 py-1 rounded-lg">
            {sym}
          </span>
        </div>
        <div>
          <span className="text-5xl font-bold text-hoff-text-primary tabular-nums">
            {fmt(amount)}
          </span>
          <p className="text-xs text-hoff-text-tertiary mt-1">{usdLabel}</p>
        </div>
      </div>

      {/* Etherscan */}
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

      {/* Review */}
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
                <path d="M12 4L20 20H4L12 4Z" fill={review === 'positive' ? '#2EBF7A' : 'none'} stroke={review === 'positive' ? '#2EBF7A' : '#6B7B7B'} strokeWidth="2" strokeLinejoin="round"/>
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
                <path d="M12 20L4 4H20L12 20Z" fill={review === 'negative' ? '#f87171' : 'none'} stroke={review === 'negative' ? '#f87171' : '#6B7B7B'} strokeWidth="2" strokeLinejoin="round"/>
              </svg>
              <span className="text-xs font-medium">Negative</span>
            </button>
          </div>
          <button
            onClick={() => {
              if (!review) return
              onSubmitReview?.(review === 'positive')
              setSubmitted(true)
            }}
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

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function ManageDeal() {
  const { dealId: dealIdParam } = useParams<{ dealId: string }>()
  const navigate = useNavigate()
  const { address } = useAccount()
  const [showCodeEntry, setShowCodeEntry] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [editAmount, setEditAmount] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editExpirationHours, setEditExpirationHours] = useState(168)

  const { dealId, escrowAddress: directAddress } = parseDealParam(dealIdParam)

  if (!isValidDealParam(dealIdParam)) {
    return (
      <Layout>
        <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6">
          <div className="bg-hoff-surface rounded-2xl p-5">
            <p className="text-sm text-red-400">Invalid deal link. Check the URL and try again.</p>
          </div>
        </main>
      </Layout>
    )
  }

  const mockDealId = dealId ?? 0n

  const { details, isLoading, isError, escrowAddress }                              = useDealDetails(dealId, directAddress)
  const { release, isPending, isConfirming, isSuccess, isError: releaseError, error: releaseErrorObj } = useReleaseEscrow(mockDealId, escrowAddress)
  const cancelDeal = useCancelDeal(mockDealId, escrowAddress)
  const editDeal   = useEditDeal(mockDealId, escrowAddress)
  const reviewHook = useSubmitReview(escrowAddress)

  // Token display helpers
  const sym = details ? payoutSymbol(details.payoutToken) : 'ETH'
  const dec = details ? payoutDecimals(details.payoutToken) : 18
  const fmt = (v: bigint) => formatUnits(v, dec)
  const usdRaw = useUsdValue(details?.amount ?? 0n, details?.payoutToken ?? null)
  const usdLabel = usdRaw ? `≈ $${usdRaw} USD` : ''

  // In mock mode there's no connected wallet — treat the user as the seller
  const isSeller = MOCK_MODE || !!(address && details && address.toLowerCase() === details.seller.toLowerCase())

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24"><Spinner /></div>
      </Layout>
    )
  }

  // ─── Error / not found ──────────────────────────────────────────────────────
  if (isError || !details) {
    return (
      <Layout>
        <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6">
          <div className="bg-hoff-surface rounded-2xl p-5">
            <p className="text-sm text-red-400">Could not load deal. Check the link and try again.</p>
          </div>
        </main>
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

  // ─── Completed (after successful release OR on-chain COMPLETE) ──────────────
  if (isSuccess || details.status === EscrowStatus.COMPLETED) {
    return (
      <Layout>
        <CompletedView
          dealIdParam={dealIdParam}
          amount={details.amount}
          description={details.description}
          sym={sym}
          fmt={fmt}
          usdLabel={usdLabel}
          onSubmitReview={(isPositive) => reviewHook.submitReview(isPositive)}
        />
      </Layout>
    )
  }

  // ─── Refunded ───────────────────────────────────────────────────────────────
  if (details.status === EscrowStatus.EXPIRED) {
    return (
      <Layout>
        <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6 space-y-5">
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="w-16 h-16 rounded-full bg-hoff-elevated border-2 border-hoff-text-tertiary/40 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B7B7B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-hoff-text-primary text-center">HandOff Refunded</h1>
            <p className="text-sm text-hoff-text-tertiary text-center">
              The buyer has reclaimed their funds after the deal expired.
            </p>
          </div>
        </main>
      </Layout>
    )
  }

  // ─── CANCELED ───────────────────────────────────────────────────────────────
  if (details.status === EscrowStatus.CANCELED) {
    return (
      <Layout>
        <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6 space-y-5">
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="w-16 h-16 rounded-full bg-red-900/30 border-2 border-red-500/40 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-hoff-text-primary text-center">HandOff Canceled</h1>
            <p className="text-sm text-hoff-text-tertiary text-center">
              This deal was canceled before the buyer funded it. No funds were moved.
            </p>
          </div>
          <Button fullWidth variant="ghost" onClick={() => navigate('/')}>
            Back to Home
          </Button>
        </main>
      </Layout>
    )
  }

  // ─── PENDING — waiting for buyer + edit/cancel ──────────────────────────────
  if (details.status === EscrowStatus.CREATED) {
    const payLink = `${window.location.origin}/pay/${dealIdParam}`

    // ── Cancel confirmation ───────────────────────────────────────────────────
    if (showCancelConfirm) {
      return (
        <Layout>
          <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6 space-y-4">
            <h1 className="text-2xl font-bold text-hoff-text-primary">Cancel HandOff?</h1>
            <p className="text-sm text-hoff-text-tertiary">
              This will permanently cancel the deal. The payment link will stop working.
              No funds have been deposited, so nothing needs to be refunded.
            </p>

            {cancelDeal.isError && (() => { const msg = parseContractError(cancelDeal.error); return msg ? <div className="bg-red-900/20 border border-red-800/30 rounded-xl px-4 py-3"><p className="text-sm text-red-400 text-center">{msg}</p></div> : null })()}

            <Button
              fullWidth
              variant="danger"
              onClick={() => cancelDeal.cancel()}
              loading={cancelDeal.isPending || cancelDeal.isConfirming}
            >
              {cancelDeal.isPending ? 'Confirm in wallet…' : cancelDeal.isConfirming ? 'Canceling…' : 'Yes, Cancel This HandOff'}
            </Button>
            <Button
              fullWidth
              variant="ghost"
              onClick={() => setShowCancelConfirm(false)}
            >
              Go Back
            </Button>
          </main>
        </Layout>
      )
    }

    // ── Edit form ─────────────────────────────────────────────────────────────
    if (showEdit) {
      const amountValid = (() => {
        if (!editAmount) return false
        try { return parseEther(editAmount as `${number}`) > 0n } catch { return false }
      })()

      return (
        <Layout>
          <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6 space-y-3">
            <button
              onClick={() => setShowEdit(false)}
              className="flex items-center gap-1.5 text-xs text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back
            </button>

            <h1 className="text-2xl font-bold text-hoff-text-primary">Edit HandOff</h1>

            {/* Amount */}
            <div className="bg-hoff-surface rounded-2xl p-5">
              <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest mb-2">Amount</p>
              <div className="flex items-start justify-between gap-3">
                <input
                  type="text"
                  inputMode="decimal"
                  value={editAmount}
                  onChange={e => setEditAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-4xl font-semibold bg-transparent text-hoff-text-primary placeholder:text-hoff-text-tertiary/40 focus:outline-none"
                />
                <span className="text-hoff-text-secondary font-medium text-sm shrink-0 mt-3">{sym}</span>
              </div>
            </div>

            {/* Description */}
            <div className="bg-hoff-surface rounded-2xl p-5">
              <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest mb-3">
                Description <span className="normal-case font-normal">(Optional)</span>
              </p>
              <input
                type="text"
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                placeholder="E.g. iPhone 14 Pro"
                className="w-full bg-transparent text-hoff-text-primary text-sm placeholder:text-hoff-text-tertiary focus:outline-none"
              />
            </div>

            {/* Expiration */}
            <div className="bg-hoff-surface rounded-2xl p-5">
              <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest mb-2">
                New Expiration
              </p>
              <select
                value={editExpirationHours}
                onChange={e => setEditExpirationHours(Number(e.target.value))}
                className="w-full bg-transparent text-hoff-text-primary text-sm focus:outline-none cursor-pointer"
              >
                {[
                  { label: '1 Day',   hours: 24 },
                  { label: '3 Days',  hours: 72 },
                  { label: '7 Days',  hours: 168 },
                  { label: '14 Days', hours: 336 },
                  { label: '30 Days', hours: 720 },
                ].map(o => (
                  <option key={o.hours} value={o.hours} className="bg-hoff-elevated">{o.label}</option>
                ))}
              </select>
            </div>

            {editDeal.isError && (() => { const msg = parseContractError(editDeal.error); return msg ? <div className="bg-red-900/20 border border-red-800/30 rounded-xl px-4 py-3"><p className="text-sm text-red-400 text-center">{msg}</p></div> : null })()}

            {!editDeal.isSuccess ? (
              <Button
                fullWidth
                onClick={() => {
                  if (!amountValid) return
                  const newExpiry = BigInt(Math.floor(Date.now() / 1000) + editExpirationHours * 3600)
                  editDeal.edit(
                    parseEther(editAmount as `${number}`),
                    editDescription,
                    (details?.payoutToken ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
                    (details?.seller ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
                    newExpiry,
                  )
                }}
                disabled={!amountValid || editDeal.isPending || editDeal.isConfirming}
                loading={editDeal.isPending || editDeal.isConfirming}
              >
                {editDeal.isPending ? 'Confirm in wallet…' : editDeal.isConfirming ? 'Updating…' : 'Save Changes'}
              </Button>
            ) : (
              <Button fullWidth variant="ghost" onClick={() => setShowEdit(false)}>
                Done
              </Button>
            )}
          </main>
        </Layout>
      )
    }

    // ── Default PENDING view ──────────────────────────────────────────────────
    return (
      <Layout>
        <main className="w-full px-4 sm:max-w-md sm:mx-auto py-4 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-hoff-text-primary">View Escrow</h1>
              <StatusBadge status={details.status} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-hoff-text-tertiary truncate">
                {details.description || `Unlabelled #${dealIdParam}`}
              </span>
              <span className="text-xs text-hoff-text-tertiary shrink-0">
                Created {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>
          </div>

          <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">Amount</p>
              <span className="text-xs font-semibold text-hoff-accent bg-hoff-accent-muted px-2.5 py-1 rounded-lg">{sym}</span>
            </div>
            <span className="text-5xl font-bold text-hoff-text-primary tabular-nums block">
              {fmt(details.amount)}
            </span>
            <div className="space-y-1.5 pt-1 border-t border-hoff-brand">
              <div className="flex items-center justify-between">
                <span className="text-xs text-hoff-text-tertiary">Expires in</span>
                <CountdownTimer expiresAt={Number(details.expiresAt) * 1000} />
              </div>
              <div className="h-1.5 bg-hoff-elevated rounded-full overflow-hidden">
                <div className="h-full bg-hoff-accent rounded-full" style={{ width: `${expiryProgress(details.expiresAt)}%` }} />
              </div>
            </div>
          </div>

          {/* Waiting indicator */}
          <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl px-4 py-3 flex items-center gap-2">
            <Spinner size="sm" />
            <span className="text-sm text-amber-400">Waiting for buyer to pay…</span>
          </div>

          {/* Share link */}
          <button
            onClick={() => {
              const text = `Pay me via HandOff: ${payLink}`
              if (typeof navigator.share !== 'undefined') {
                navigator.share({ title: 'HandOff Payment', text, url: payLink }).catch(() => {})
              } else {
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
              }
            }}
            className="w-full h-12 rounded-xl border border-hoff-brand text-hoff-text-secondary hover:bg-hoff-surface hover:text-hoff-text-primary transition-colors text-sm font-semibold flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share HandOff
          </button>

          <button
            onClick={() => navigator.clipboard.writeText(payLink).catch(() => {})}
            className="w-full text-xs text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors py-1 text-center"
          >
            Copy payment link
          </button>

          {/* Edit + Cancel (UC-2 / UC-3 — only for seller, only PENDING) */}
          {isSeller && (
            <div className="flex gap-2 pt-2">
              <Button
                variant="ghost"
                fullWidth
                onClick={() => {
                  setEditAmount(formatEther(details.amount))
                  setEditDescription(details.description)
                  setEditExpirationHours(168)
                  setShowEdit(true)
                }}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                fullWidth
                onClick={() => setShowCancelConfirm(true)}
              >
                Cancel
              </Button>
            </div>
          )}
        </main>
      </Layout>
    )
  }

  // ─── FUNDED — code entry or overview ────────────────────────────────────────
  if (showCodeEntry && isSeller) {
    return (
      <Layout>
        <ClaimFundsView
          dealIdParam={dealIdParam}
          amount={details.amount}
          expiresAt={details.expiresAt}
          description={details.description}
          sym={sym}
          fmt={fmt}
          usdLabel={usdLabel}
          onBack={() => setShowCodeEntry(false)}
          onRelease={(code) => release(code)}
          isPending={isPending}
          isConfirming={isConfirming}
          isError={releaseError}
          error={releaseErrorObj}
        />
      </Layout>
    )
  }

  return (
    <Layout>
      <ViewEscrowView
        dealIdParam={dealIdParam}
        amount={details.amount}
        expiresAt={details.expiresAt}
        seller={details.seller}
        sellerEns={details.sellerEns ?? ''}
        status={details.status}
        description={details.description}
        sym={sym}
        fmt={fmt}
        usdLabel={usdLabel}
        onUnlock={() => isSeller ? setShowCodeEntry(true) : undefined}
      />
    </Layout>
  )
}
