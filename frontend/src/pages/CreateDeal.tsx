import { useState, useEffect } from 'react'
import { parseEther, isAddress } from 'viem'
import type { Address } from 'viem'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { EnsInput } from '@/components/EnsInput'
import { useCreateDeal } from '@/hooks/useEscrowWrite'
import { TOKENS, TOKEN_KEYS, type TokenKey } from '@/lib/tokens'
import { useUsdValue } from '@/hooks/useTokenPrice'

function validate(amount: string) {
  const errors: { amount?: string } = {}
  if (!amount) {
    errors.amount = 'Required'
  } else {
    try {
      const parsed = parseEther(amount as `${number}`)
      if (parsed <= 0n) errors.amount = 'Must be greater than 0'
    } catch {
      errors.amount = 'Enter a valid number (e.g. 0.05)'
    }
  }
  return errors
}

const TIMEOUT_OPTIONS = [
  { label: '1 Day', hours: 24 },
  { label: '3 Days', hours: 72 },
  { label: '7 Days', hours: 168 },
  { label: '14 Days', hours: 336 },
  { label: '30 Days', hours: 720 },
]

export default function CreateDeal() {
  const navigate = useNavigate()
  const { isAuthenticated, login } = useDynamicAuth()
  const canAct = isAuthenticated

  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [resolvedAddress, setResolvedAddress] = useState<Address | null>(null)
  const [payoutAddressConfirmed, setPayoutAddressConfirmed] = useState(false)

  const isEnsInput = recipient.endsWith('.eth')

  // Reset confirmation when recipient changes
  useEffect(() => {
    setPayoutAddressConfirmed(false)
  }, [recipient])
  const [description, setDescription] = useState('')
  const [payoutToken, setPayoutToken] = useState<TokenKey>('ETH')
  const [timeoutHours, setTimeoutHours] = useState(168)
  const [touched, setTouched] = useState(false)
  const [copied, setCopied] = useState(false)

  const { create, isPending, isConfirming, isSuccess, isError, error, newDealId, newEscrowAddress } =
    useCreateDeal()

  const errors = validate(amount)
  const hasErrors = Object.keys(errors).length > 0

  // USD estimate for the entered amount
  const parsedAmount = (() => { try { return amount ? parseEther(amount as `${number}`) : 0n } catch { return 0n } })()
  const tokenAddr = TOKENS[payoutToken]?.address ?? null
  const usdValue = useUsdValue(parsedAmount, tokenAddr)

  // Prefer dealId for clean URLs, fall back to escrow address
  const dealParam = newDealId ? String(newDealId) : newEscrowAddress
  const shareableLink =
    dealParam ? `${window.location.origin}/pay/${dealParam}` : null

  // Debug: trace success screen gate
  console.log('[CreateDeal] isSuccess:', isSuccess, 'newDealId:', newDealId?.toString(), 'newEscrowAddress:', newEscrowAddress, 'dealParam:', dealParam, 'shareableLink:', shareableLink)

  function handleCreate() {
    setTouched(true)
    if (hasErrors) return
    const sellerEns = isEnsInput && resolvedAddress ? recipient : ''
    // Derive payout address: resolved ENS address > raw address input > zero (defaults to msg.sender)
    const payoutAddress = (
      (isEnsInput && resolvedAddress)
        ? resolvedAddress
        : isAddress(recipient)
          ? recipient
          : '0x0000000000000000000000000000000000000000'
    ) as `0x${string}`
    create(amount, description, timeoutHours, payoutToken, sellerEns, payoutAddress)
  }

  function handleShare() {
    if (!shareableLink) return
    const text = `Pay me via HandOff: ${shareableLink}`
    if (typeof navigator.share !== 'undefined') {
      navigator.share({ title: 'HandOff Payment', text, url: shareableLink }).catch(() => {})
    } else {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(text)}`,
        '_blank',
      )
    }
  }

  // ─── Success screen ─────────────────────────────────────────────────────────
  // Show success if tx confirmed — even if event parsing fails (shareableLink may be null)
  if (isSuccess) {
    return (
      <Layout>
        <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6 space-y-5">
          {/* Checkmark */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="w-16 h-16 rounded-full bg-hoff-accent/20 border-2 border-hoff-accent flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2EBF7A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-hoff-text-primary text-center">
              HandOff Created
            </h1>
            <p className="text-sm text-hoff-text-tertiary text-center">
              {shareableLink ? 'Share this link with your buyer' : 'Your escrow is live on-chain'}
            </p>
          </div>

          {shareableLink ? (
            <>
              {/* Link card */}
              <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
                <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">
                  Payment Link
                </p>
                <div className="flex items-center gap-2 bg-hoff-elevated rounded-xl px-3 py-2.5 border border-hoff-brand">
                  <span className="flex-1 min-w-0 text-xs font-mono break-all text-hoff-text-tertiary">
                    {shareableLink}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(shareableLink)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg hover:bg-hoff-surface transition-colors"
                    aria-label="Copy link"
                  >
                    {copied ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2EBF7A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-hoff-text-tertiary">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
                <Button fullWidth variant="ghost" onClick={handleShare}>
                  Share
                </Button>
              </div>

              {/* Go to deal */}
              <Button
                fullWidth
                onClick={() => navigate(`/deal/${dealParam}`)}
              >
                Go to my deal →
              </Button>

              <p className="text-xs text-hoff-text-tertiary text-center">
                You'll enter the buyer's code there to release funds
              </p>
            </>
          ) : (
            <>
              {/* Fallback: tx confirmed but event parsing failed — still show success */}
              <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl px-4 py-3 space-y-2">
                <p className="text-sm text-amber-400">
                  Deal created but we couldn't extract the payment link automatically.
                </p>
                <p className="text-xs text-amber-400/70">
                  Check your recent transactions on Etherscan (Sepolia) to find the new escrow address, then share <span className="font-mono">{window.location.origin}/pay/[address]</span> with your buyer.
                </p>
              </div>
              <Button fullWidth onClick={() => navigate('/')}>
                Back to Home
              </Button>
            </>
          )}
        </main>
      </Layout>
    )
  }

  // ─── Form ───────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6 space-y-3">
        <div className="mb-4">
          <h2 className="text-3xl font-bold text-hoff-text-primary">New HandOff</h2>
          <p className="text-sm text-hoff-text-tertiary mt-1">
            Set price, recipient, and expiration
          </p>
        </div>

        {!canAct && (
          <Button fullWidth onClick={() => login()}>
            Connect Wallet
          </Button>
        )}

        {canAct && (
          <>
            {/* Amount */}
            <div className="bg-hoff-surface rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest mb-2">
                    Amount
                  </p>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full text-4xl font-semibold bg-transparent text-hoff-text-primary placeholder:text-hoff-text-tertiary/40 focus:outline-none"
                  />
                  {usdValue && parsedAmount > 0n && (
                    <p className="text-xs text-hoff-text-tertiary mt-1">≈ ${usdValue} USD</p>
                  )}
                  {touched && errors.amount && (
                    <p className="text-xs text-red-400 mt-1">{errors.amount}</p>
                  )}
                </div>
                <select
                  value={payoutToken}
                  onChange={e => setPayoutToken(e.target.value)}
                  className="shrink-0 mt-6 h-9 px-3 rounded-xl bg-hoff-elevated border border-hoff-brand text-hoff-text-secondary font-medium text-sm appearance-none cursor-pointer focus:outline-none focus:border-hoff-accent/60 transition-colors text-center"
                  style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                >
                  {TOKEN_KEYS.map(key => (
                    <option key={key} value={key} className="bg-hoff-elevated">
                      {TOKENS[key].symbol}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Payout address / ENS name */}
            <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
              <EnsInput
                value={recipient}
                onChange={setRecipient}
                onResolved={addr => {
                  setResolvedAddress(addr)
                  setPayoutAddressConfirmed(false)
                }}
                label="Payout Address (Optional)"
                hint="Enter your ENS name or a different wallet to receive funds. Leave blank to use your connected wallet."
                placeholder="yourname.eth or 0x..."
              />
              {/* Explicit confirmation required when an ENS name resolves to an address */}
              {isEnsInput && resolvedAddress && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payoutAddressConfirmed}
                    onChange={e => setPayoutAddressConfirmed(e.target.checked)}
                    className="mt-0.5 accent-hoff-accent"
                  />
                  <span className="text-xs text-hoff-text-tertiary">
                    I confirm this is the correct payout address. Funds sent to a wrong address are unrecoverable.
                  </span>
                </label>
              )}
            </div>

            {/* Description */}
            <div className="bg-hoff-surface rounded-2xl p-5">
              <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest mb-3">
                Description / Label{' '}
                <span className="normal-case font-normal">(Optional)</span>
              </p>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="E.g. iPhone 14 Pro — Facebook Marketplace"
                className="w-full bg-transparent text-hoff-text-primary text-sm placeholder:text-hoff-text-tertiary focus:outline-none"
              />
            </div>

            {/* Expires In */}
            <div className="bg-hoff-surface rounded-2xl p-5">
              <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest mb-2">
                Expires In
              </p>
              <select
                value={timeoutHours}
                onChange={e => setTimeoutHours(Number(e.target.value))}
                className="w-full bg-transparent text-hoff-text-primary text-sm focus:outline-none cursor-pointer"
              >
                {TIMEOUT_OPTIONS.map(o => (
                  <option key={o.hours} value={o.hours} className="bg-hoff-elevated">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {isError && <p className="text-xs text-red-400 text-center">{error?.message ?? 'Transaction failed'}</p>}

            <Button
              fullWidth
              onClick={handleCreate}
              loading={isPending || isConfirming}
              disabled={isEnsInput && !!resolvedAddress && !payoutAddressConfirmed}
              type="submit"
            >
              {isPending ? 'Confirm in wallet…' : isConfirming ? 'Deploying on-chain…' : 'Create HandOff'}
            </Button>

            <p className="text-center text-xs text-hoff-text-tertiary">
              Funds will be held in escrow until both parties confirm
            </p>
          </>
        )}
      </main>
    </Layout>
  )
}
