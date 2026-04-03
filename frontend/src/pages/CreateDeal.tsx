import { useState } from 'react'
import { parseEther } from 'viem'
import { useAccount } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useCreateDeal } from '@/hooks/useEscrowWrite'
import { MOCK_MODE } from '@/lib/mock'

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
  const { isConnected } = useAccount()
  const canAct = isConnected || MOCK_MODE

  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [description, setDescription] = useState('')
  const [timeoutHours, setTimeoutHours] = useState(168)
  const [touched, setTouched] = useState(false)
  const [copied, setCopied] = useState(false)

  const { create, isPending, isConfirming, isSuccess, isError, error, newDealId } =
    useCreateDeal()

  const errors = validate(amount)
  const hasErrors = Object.keys(errors).length > 0

  const shareableLink =
    newDealId !== undefined ? `${window.location.origin}/pay/${newDealId}` : null

  function handleCreate() {
    setTouched(true)
    if (hasErrors) return
    create(amount, description, timeoutHours)
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
  if (isSuccess && shareableLink) {
    return (
      <Layout>
        <main className="max-w-sm mx-auto px-4 py-6 space-y-5">
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
              Share this link with your buyer
            </p>
          </div>

          {/* Link card */}
          <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
            <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">
              Payment Link
            </p>
            <div className="bg-hoff-elevated rounded-xl px-3 py-2.5 text-xs font-mono break-all text-hoff-text-tertiary border border-hoff-brand">
              {shareableLink}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(shareableLink)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? 'Copied!' : 'Copy link'}
              </Button>
              <Button variant="ghost" onClick={handleShare}>
                Share
              </Button>
            </div>
          </div>

          {/* Go to deal */}
          <Button
            fullWidth
            onClick={() => navigate(`/deal/${newDealId}`)}
          >
            Go to my deal →
          </Button>

          <p className="text-xs text-hoff-text-tertiary text-center">
            You'll enter the buyer's code there to release funds
          </p>
        </main>
      </Layout>
    )
  }

  // ─── Form ───────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <main className="max-w-sm mx-auto px-4 py-6 space-y-3">
        <div className="mb-4">
          <h2 className="text-3xl font-bold text-hoff-text-primary">New HandOff</h2>
          <p className="text-sm text-hoff-text-tertiary mt-1">
            Set price, recipient, and expiration
          </p>
        </div>

        {!canAct && (
          <div className="bg-hoff-surface rounded-2xl p-5">
            <p className="text-sm text-hoff-text-tertiary text-center">
              Connect your wallet to create a HandOff.
            </p>
          </div>
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
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full text-4xl font-semibold bg-transparent text-hoff-text-primary placeholder:text-hoff-text-tertiary/40 focus:outline-none"
                  />
                  {touched && errors.amount && (
                    <p className="text-xs text-red-400 mt-2">{errors.amount}</p>
                  )}
                </div>
                <span className="flex items-center gap-1.5 bg-hoff-elevated border border-hoff-brand px-3 py-1.5 rounded-xl text-hoff-text-secondary font-medium text-sm shrink-0 mt-6">
                  ETH
                </span>
              </div>
            </div>

            {/* Recipient */}
            <div className="bg-hoff-surface rounded-2xl p-5">
              <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest mb-3">
                Recipient Wallet
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  placeholder="Paste address or ENS name"
                  className="flex-1 bg-transparent text-hoff-text-primary text-sm placeholder:text-hoff-text-tertiary focus:outline-none"
                />
                <button
                  onClick={() =>
                    navigator.clipboard
                      .readText()
                      .then(t => setRecipient(t))
                      .catch(() => {})
                  }
                  className="text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors shrink-0"
                  aria-label="Paste from clipboard"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                </button>
              </div>
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

            {/* TX states */}
            {isPending && (
              <div className="flex items-center gap-2 text-amber-400 bg-amber-900/20 px-4 py-3 rounded-xl border border-amber-800/30">
                <Spinner size="sm" />
                <span className="text-sm">Confirm in your wallet app</span>
              </div>
            )}
            {isConfirming && (
              <div className="flex items-center gap-2 text-hoff-accent bg-hoff-accent-muted px-4 py-3 rounded-xl">
                <Spinner size="sm" />
                <span className="text-sm">Transaction processing on-chain...</span>
              </div>
            )}
            {isError && (
              <div className="text-red-400 bg-red-900/20 px-4 py-3 rounded-xl text-sm border border-red-800/30">
                {error?.message ?? 'Transaction failed'}
              </div>
            )}

            <Button
              fullWidth
              onClick={handleCreate}
              loading={isPending || isConfirming}
              type="submit"
            >
              Create HandOff
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
