import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'
import { formatEther, formatUnits } from 'viem'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CountdownTimer } from '@/components/escrow/CountdownTimer'
import { useDealDetails, parseDealParam } from '@/hooks/useEscrow'
import { useDepositFunds, useClaimRefund, useSubmitReview } from '@/hooks/useEscrowWrite'
import { parseContractError } from '@/lib/errors'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useQuote, useSwapAndDeposit } from '@/hooks/useTokenSwap'
import { generateUnlockCode, hashUnlockCode } from '@/lib/code-gen'
import { EscrowStatus } from '@/lib/types'
import { IntroScreen } from '@/components/escrow/IntroScreen'
import { TOKENS, TOKEN_KEYS, type TokenKey, payoutSymbol, payoutDecimals } from '@/lib/tokens'
import { useUsdValue } from '@/hooks/useTokenPrice'
import { EnsName } from '@/components/EnsName'
import { DealReceiptBadge } from '@/components/DealReceiptBadge'
import { Dropdown } from '@/components/ui/Dropdown'
import { useReputation } from '@/hooks/useReputation'
import { MOCK_MODE, mockExpire } from '@/lib/mock'
import { getAutoSelectedTokenKey, shouldShowTokenSelector, shouldUseSwapPath } from '@/lib/buyerPayLogic'
import { formatFeePercent } from '@/lib/fee'
import { getTargetChainId, CHAIN_IDS } from '@/lib/chains'

const DEFAULT_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function isValidDealParam(param: string | undefined): param is string {
  if (!param) return false
  const { dealId, escrowAddress } = parseDealParam(param)
  return !!dealId || !!escrowAddress
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
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(interval)
  }, [])

  const remaining = Math.max(0, expiresAt - now)
  const fraction = Math.min(1, remaining / totalMs)
  const color = fraction > 0.25 ? 'bg-hoff-accent' : fraction > 0 ? 'bg-hoff-warn' : 'bg-hoff-err'

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

function TokenSelector({ selected, onChange }: { selected: TokenKey; onChange: (key: TokenKey) => void }) {
  return (
    <Dropdown
      className="shrink-0 min-w-[90px]"
      value={selected}
      onChange={v => onChange(v as TokenKey)}
      options={TOKEN_KEYS.map(key => ({ label: TOKENS[key].symbol, value: key }))}
    />
  )
}

// ─── Swap preview card ────────────────────────────────────────────────────────

interface SwapPreviewProps {
  tokenKey: TokenKey
  quotedIn: bigint | undefined
  amountOutWei: bigint
  payoutSymbol: string
  payoutDecimals: number
  isLoading: boolean
  error: string | null
}

function SwapPreview({ tokenKey, quotedIn, amountOutWei, payoutSymbol: outSym, payoutDecimals: outDec, isLoading, error }: SwapPreviewProps) {
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
        <div className="text-hoff-err bg-hoff-err-bg px-4 py-3 rounded-xl text-sm border border-hoff-err/20">
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
                {formatUnits(amountOutWei, outDec)} {outSym}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-hoff-brand">
            <span className="text-xs text-hoff-text-tertiary">Slippage tolerance</span>
            <span className="text-xs text-hoff-text-secondary">0.5%</span>
          </div>

          <p className="text-xs text-hoff-text-tertiary">
            Powered by Uniswap. Your {token.symbol} will be swapped to {outSym} and deposited into the escrow.
          </p>
        </>
      )}

      {!isLoading && !error && quotedIn === undefined && (
        <p className="text-sm text-hoff-text-tertiary py-2">
          No swap route available — try a different token or fund directly with {outSym}.
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
  txHash?: string
  status?: EscrowStatus
  onSubmitReview: (vote: 'positive' | 'negative') => void
}

function CompletedView({ code, description, dealIdParam, txHash, status, onSubmitReview }: CompletedViewProps) {
  const isCompleted = status === EscrowStatus.COMPLETED
  const [review, setReview] = useState<'positive' | 'negative' | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const etherscanBase = getTargetChainId() === CHAIN_IDS.MAINNET
    ? 'https://etherscan.io/tx/'
    : 'https://sepolia.etherscan.io/tx/'
  const etherscanHref = txHash ? `${etherscanBase}${txHash}` : undefined

  function handleSubmit() {
    if (!review) return
    onSubmitReview(review)
    setSubmitted(true)
  }

  return (
    <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6 space-y-5">
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

      {/* ENS Receipt Badge */}
      <DealReceiptBadge dealIdParam={dealIdParam} />

      {etherscanHref && (
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
      )}

      {/* Review section — only available once seller completes the handoff (COMPLETED state) */}
      {!isCompleted && (
        <div className="bg-hoff-elevated rounded-xl px-4 py-3 text-center space-y-1">
          <p className="text-xs text-hoff-text-tertiary">Waiting for seller to complete the handoff…</p>
          <p className="text-xs text-hoff-text-tertiary/60">You can leave a review once funds are released</p>
        </div>
      )}

      {isCompleted && !submitted ? (
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
                  ? 'bg-hoff-err-bg border-hoff-err text-hoff-err'
                  : 'bg-hoff-surface border-hoff-surface text-hoff-text-secondary hover:border-hoff-err/40'
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
            className="w-full h-12 rounded-xl bg-hoff-accent text-hoff-accent-fg font-bold text-sm disabled:opacity-40 hover:bg-hoff-accent-hover transition-colors"
          >
            Submit
          </button>
        </div>
      ) : isCompleted ? (
        <div className="bg-hoff-accent/10 border border-hoff-accent/30 rounded-xl px-4 py-3 text-center">
          <p className="text-sm text-hoff-accent font-medium">Thanks for your review!</p>
        </div>
      ) : null}
    </main>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function BuyerPay() {
  const { dealId: dealIdParam } = useParams<{ dealId: string }>()
  const { isConnected } = useAccount()
  const { login } = useDynamicAuth()
  const [selectedToken, setSelectedToken] = useState<TokenKey>('ETH')
  const [isAutoSelected, setIsAutoSelected] = useState(true)
  const [slippage, setSlippage] = useState(0.5)
  const [showIntro, setShowIntro] = useState(true)

  const { dealId, escrowAddress: directAddress } = parseDealParam(dealIdParam)

  // ─── All hooks unconditionally — rules of hooks require no conditional calls ──
  const { details, isLoading, isError, escrowAddress } = useDealDetails(dealId, directAddress)
  const dealIdOrZero = dealId ?? 0n
  const { deposit, isPending, isConfirming, isSuccess, isError: txError, error: txErrorObj, txHash } = useDepositFunds(dealIdOrZero, escrowAddress)
  const refund    = useClaimRefund(dealIdOrZero, escrowAddress)
  const reviewHook = useSubmitReview(escrowAddress)
  const amountWei  = details?.amount ?? 0n
  const requiredFundingWei = details?.requiredFunding ?? 0n
  const usdValue   = useUsdValue(amountWei, details?.payoutToken ?? null)
  const { quotedIn, quoteResponse, isLoading: quoteLoading, error: quoteError } = useQuote(
    selectedToken,
    requiredFundingWei,
    details?.payoutToken ?? null,
    slippage,
  )
  const swap = useSwapAndDeposit(dealIdOrZero, selectedToken, escrowAddress, quoteResponse)
  const { reputation } = useReputation(details?.seller as `0x${string}` | undefined)

  // Derive isSwapPath — must be after all hooks
  const isSwapPath = !!details && shouldUseSwapPath(selectedToken, details.payoutToken ?? null)

  // Persist unlock code keyed by escrow address so it survives page refresh
  const [unlockCode, setUnlockCodeState] = useState<string | null>(null)
  function setUnlockCode(code: string | null) {
    setUnlockCodeState(code)
    if (code && escrowAddress) {
      try { localStorage.setItem(`handoff_code_${escrowAddress}`, code) } catch { /* quota */ }
    }
  }

  useEffect(() => {
    if (unlockCode || !escrowAddress || details?.status !== EscrowStatus.FUNDED) return
    try {
      const saved = localStorage.getItem(`handoff_code_${escrowAddress}`)
      if (saved) setUnlockCodeState(saved)
    } catch { /* ignore */ }
  }, [escrowAddress, details?.status, unlockCode])

  useEffect(() => {
    if (!details || !isAutoSelected) return
    setSelectedToken(getAutoSelectedTokenKey(details.payoutToken ?? null))
  }, [details?.payoutToken, isAutoSelected, details])

  // ─── Guard (after all hooks) ───────────────────────────────────────────────
  if (!isValidDealParam(dealIdParam)) {
    return (
      <Layout>
        <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6">
          <div className="bg-hoff-surface rounded-2xl p-5">
            <p className="text-sm text-hoff-err">Invalid deal link. Check the URL and try again.</p>
          </div>
        </main>
      </Layout>
    )
  }

  const canAct = isConnected || MOCK_MODE

  // Determine overall success from either direct deposit or swap path
  const fundingSuccess = isSwapPath ? swap.isSuccess : isSuccess

  // Expired detection (UC-9 / UC-17)
  const isExpired = !!(details && details.status === EscrowStatus.FUNDED &&
    Date.now() > Number(details.expiresAt) * 1000)

  // ─── Actions ────────────────────────────────────────────────────────────────
  function handleDeposit() {
    if (!details) return
    const code = generateUnlockCode()
    const codeHash = hashUnlockCode(code)
    setUnlockCode(code)

    if (isSwapPath) {
      swap.swapAndDeposit(codeHash)
    } else {
      deposit(details.requiredFunding, codeHash, '', details.payoutToken)
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
          txHash={isSwapPath ? swap.txHash : txHash}
          status={details?.status}
          onSubmitReview={(vote) => {
            reviewHook.submitReview(vote === 'positive')
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
  const feePercentLabel = details ? formatFeePercent(details.protocolFeeBps) : '0.00%'

  // ─── TX state helpers ───────────────────────────────────────────────────────
  const anyPending    = isSwapPath ? (swap.isApprovePending || swap.isSwapPending) : isPending
  const anyConfirming = isSwapPath ? (swap.isApproveConfirming || swap.isSwapConfirming) : isConfirming
  const anyError      = isSwapPath ? swap.isError : txError
  const anyErrorObj   = isSwapPath ? swap.error : txErrorObj
  const anyBusy       = anyPending || anyConfirming
  const friendlyErr   = anyError ? parseContractError(anyErrorObj) : null

  // CTA label
  function ctaLabel(): string {
    if (!canAct) return 'Connect Wallet To Continue'
    if (isSwapPath && quotedIn !== undefined) {
      const token = TOKENS[selectedToken]
      const full = formatUnits(quotedIn, token.decimals)
      const n = parseFloat(full)
      const display = n === 0 ? full : n.toPrecision(6).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
      return `Pay ${display} ${token.symbol}`
    }
    if (!isSwapPath && details) {
      const full = formatUnits(details.amount, dec)
      const n = parseFloat(full)
      const display = n === 0 ? full : n.toPrecision(6).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
      return `Pay ${display} ${sym}`
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
      <main className="w-full px-4 sm:max-w-md sm:mx-auto py-4 space-y-3">

        {isError || !details ? (
          <div className="bg-hoff-surface rounded-2xl p-5">
            <p className="text-sm text-hoff-err">Could not load deal. Check the link and try again.</p>
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

              <div className="flex items-end justify-between gap-3">
                <div>
                  <span className="text-5xl font-bold text-hoff-text-primary tabular-nums">
                    {fmt(details.amount)}
                  </span>
                  <span className="text-lg font-medium text-hoff-text-tertiary ml-1.5">{sym}</span>
                </div>
                {details.status === EscrowStatus.CREATED && shouldShowTokenSelector(details.payoutToken) && (
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <span className="text-[10px] text-hoff-text-tertiary uppercase tracking-wider">Pay with</span>
                    <TokenSelector
                      selected={selectedToken}
                      onChange={(key) => {
                        setSelectedToken(key)
                        setIsAutoSelected(false)
                      }}
                    />
                  </div>
                )}
              </div>

              <p className="text-xs text-hoff-text-tertiary">
                {usdValue ? `≈ $${usdValue} USD` : 'Fetching price...'}
              </p>

            </div>

            {/* Fee breakdown — adapts to selected pay token */}
            <div className="bg-hoff-surface rounded-2xl p-5 space-y-1">
              {isSwapPath && details.status === EscrowStatus.CREATED ? (
                <>
                  {quoteLoading && (
                    <div className="flex items-center gap-2 py-1">
                      <Spinner size="sm" />
                      <span className="text-xs text-hoff-text-tertiary">Getting quote...</span>
                    </div>
                  )}
                  {quoteError && (
                    <p className="text-xs text-hoff-err py-1">{quoteError}</p>
                  )}
                  {!quoteLoading && !quoteError && quotedIn !== undefined && (() => {
                    const payToken = TOKENS[selectedToken]
                    const payFmt = (v: bigint) => {
                      const full = formatUnits(v, payToken.decimals)
                      const n = parseFloat(full)
                      return n === 0 ? full : n.toPrecision(6).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
                    }
                    const paySym = payToken.symbol
                    return (
                      <>
                        <FeeRow label={`Seller receives (${sym})`} value={`${fmt(details.amount)} ${sym}`} />
                        {details.feeAmount > 0n && (
                          <FeeRow label={`Protocol Fee (${feePercentLabel})`} value={`${fmt(details.feeAmount)} ${sym}`} />
                        )}
                        <div className="border-t border-hoff-brand pt-1.5 mt-1.5">
                          <FeeRow label={`You pay (${paySym})`} value={`${payFmt(quotedIn)} ${paySym}`} highlight />
                        </div>
                        <div className="flex items-center justify-between pt-1.5 border-t border-hoff-brand">
                          <span className="text-xs text-hoff-text-tertiary">Slippage</span>
                          <div className="flex items-center gap-1">
                            {[0.1, 0.5, 1.0].map(opt => (
                              <button
                                key={opt}
                                onClick={() => setSlippage(opt)}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                  slippage === opt
                                    ? 'bg-hoff-accent text-hoff-bg'
                                    : 'bg-hoff-elevated text-hoff-text-tertiary hover:text-hoff-text-secondary'
                                }`}
                              >
                                {opt}%
                              </button>
                            ))}
                          </div>
                        </div>
                        <p className="text-[10px] text-hoff-text-tertiary pt-1">
                          Fee included · Powered by Uniswap · {paySym} → {sym}
                        </p>
                      </>
                    )
                  })()}
                  {!quoteLoading && !quoteError && quotedIn === undefined && (
                    <p className="text-xs text-hoff-text-tertiary py-1">
                      No swap route available — try a different token.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <FeeRow label={`Seller receives (${sym})`} value={`${fmt(details.amount)} ${sym}`} />
                  {details.feeAmount > 0n && (
                    <FeeRow label={`Protocol Fee (${feePercentLabel})`} value={`${fmt(details.feeAmount)} ${sym}`} />
                  )}
                  <div className="border-t border-hoff-brand pt-1.5 mt-1.5">
                    <FeeRow label="Total" value={`${fmt(details.requiredFunding)} ${sym} + gas`} highlight />
                  </div>
                </>
              )}
            </div>

            {/* Expires row with progress bar */}
            <div className="bg-hoff-surface rounded-2xl px-5 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-hoff-text-tertiary">Expires in</span>
                <CountdownTimer expiresAt={Number(details.expiresAt) * 1000} />
              </div>
              <ExpiryBar expiresAt={Number(details.expiresAt) * 1000} totalMs={DEFAULT_TIMEOUT_MS} />
            </div>

            {/* Creator + reputation card */}
            <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-hoff-elevated flex items-center justify-center text-hoff-text-secondary text-xs font-bold shrink-0">
                  {details.seller.slice(2, 4).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-xs text-hoff-text-tertiary">Creator</p>
                    <span className="text-[9px] font-semibold text-hoff-accent bg-hoff-accent/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">ENS</span>
                  </div>
                  {/* Forward ENS: seller's ENS name as stored on-chain at deal creation */}
                  {details.sellerEns ? (
                    <p className="text-sm text-hoff-text-primary font-medium truncate">{details.sellerEns}</p>
                  ) : (
                    /* Reverse ENS: resolve address → name via ENS registry */
                    <EnsName
                      address={details.seller as `0x${string}`}
                      className="text-sm text-hoff-text-primary font-mono truncate block"
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-hoff-brand">
                <span className="text-xs text-hoff-text-tertiary">Completed HandOffs</span>
                <span className="text-xs text-hoff-text-secondary font-medium">{reputation.sellerDealCount}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-hoff-brand">
                <span className="text-xs text-hoff-text-tertiary">Volume</span>
                <span className="text-xs text-hoff-text-secondary font-medium">{formatEther(reputation.sellerTotalVolume)} ETH</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-hoff-brand">
                <span className="text-xs text-hoff-text-tertiary">Reputation</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-hoff-text-secondary font-medium">
                    {reputation.sellerTotalReviews > 0
                      ? `${Math.round((reputation.sellerPositiveReviews / reputation.sellerTotalReviews) * 100)}% positive`
                      : 'No reviews yet'}
                  </span>
                  <div className="flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24">
                      <path d="M12 5L20 19H4L12 5Z" fill="#2EBF7A" stroke="#2EBF7A" strokeWidth="2" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-xs text-hoff-text-secondary">{reputation.sellerPositiveReviews}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-0.5 rounded-full bg-hoff-text-tertiary inline-block" />
                    <span className="text-xs text-hoff-text-secondary">{reputation.sellerTotalReviews - reputation.sellerPositiveReviews}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            {details.status === EscrowStatus.CREATED && (
              <>
                {anyError && <ErrorBanner error={anyErrorObj} />}
                <Button
                  fullWidth
                  onClick={canAct ? handleDeposit : () => login()}
                  loading={anyBusy}
                  disabled={anyBusy || (isSwapPath && quotedIn === undefined && !quoteLoading)}
                >
                  {txMessage() ?? ctaLabel()}
                </Button>
              </>
            )}

            {/* FUNDED — not expired */}
            {details.status === EscrowStatus.FUNDED && !isExpired && (
              <div className="bg-hoff-warn-bg border border-hoff-warn/20 rounded-xl px-4 py-3">
                <p className="text-sm text-hoff-warn text-center">This escrow has already been funded.</p>
              </div>
            )}

            {/* FUNDED + expired — UC-9: Claim Refund */}
            {isExpired && (
              <div className="space-y-3">
                <div className="bg-hoff-err-bg border border-hoff-err/20 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-sm text-hoff-err font-medium text-center">This HandOff has expired</p>
                  <p className="text-xs text-hoff-err/70 text-center">
                    The seller did not enter the code in time. You can reclaim your funds.
                  </p>
                </div>

                {refund.isError && <p className="text-xs text-hoff-err text-center">Refund failed. Try again.</p>}

                {!refund.isSuccess ? (
                  <Button
                    fullWidth
                    variant="danger"
                    onClick={() => refund.claimRefund()}
                    loading={refund.isPending || refund.isConfirming}
                  >
                    {refund.isPending ? 'Confirm in wallet…' : refund.isConfirming ? 'Processing refund…' : `Claim Refund — ${fmt(details.requiredFunding)} ${sym}`}
                  </Button>
                ) : (
                  <p className="text-xs text-hoff-accent text-center py-1">{fmt(details.requiredFunding)} {sym} returned to your wallet</p>
                )}
              </div>
            )}

            {/* REFUNDED (already claimed, e.g. revisiting the page) */}
            {details.status === EscrowStatus.EXPIRED && (
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
                  <div className="w-14 h-14 rounded-full bg-hoff-err-bg border-2 border-hoff-err/40 flex items-center justify-center">
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
                onClick={() => mockExpire(dealIdOrZero)}
                className="w-full text-xs text-hoff-text-tertiary hover:text-hoff-warn transition-colors py-1 text-center"
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
