import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CodeDisplay } from '@/components/escrow/CodeDisplay'
import { CountdownTimer } from '@/components/escrow/CountdownTimer'
import { useDealDetails } from '@/hooks/useEscrow'
import { useDepositFunds } from '@/hooks/useEscrowWrite'
import { generateUnlockCode, hashUnlockCode } from '@/lib/code-gen'
import { EscrowStatus } from '@/lib/types'

function isValidDealId(param: string | undefined): param is string {
  if (!param) return false
  const n = Number(param)
  return Number.isInteger(n) && n > 0
}

export default function BuyerPay() {
  const { dealId: dealIdParam } = useParams<{ dealId: string }>()
  const navigate = useNavigate()
  const { isConnected } = useAccount()
  const [unlockCode, setUnlockCode] = useState<string | null>(null)

  // ─── Guard (before any hooks) ─────────────────────────────────────────────────
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

  // ─── Hooks ────────────────────────────────────────────────────────────────────
  const { details, isLoading, isError }                                   = useDealDetails(dealId)
  const { deposit, isPending, isConfirming, isSuccess, isError: txError } = useDepositFunds(dealId)

  // ─── Action ───────────────────────────────────────────────────────────────────
  function handleDeposit() {
    if (!details) return
    const code = generateUnlockCode()
    setUnlockCode(code)
    deposit(formatEther(details.amount), hashUnlockCode(code))
  }

  // ─── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <main className="max-w-sm mx-auto px-4 py-4 space-y-3">

        {/* View Existing link */}
        <div className="flex justify-end">
          <button
            onClick={() => navigate(`/deal/${dealIdParam}`)}
            className="text-xs text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors"
          >
            View Existing
          </button>
        </div>

        {isError || !details ? (
          <div className="bg-hoff-surface rounded-2xl p-5">
            <p className="text-sm text-red-400">Could not load deal. Check the link and try again.</p>
          </div>
        ) : (
          <>
            {/* Title + status */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-hoff-text-primary">Pay Escrow</h1>
                <StatusBadge status={details.status} />
              </div>
              <p className="text-xs text-hoff-text-tertiary font-mono">
                {details.description || 'Untitled'}&nbsp;&nbsp;#{dealIdParam}
              </p>
            </div>

            {/* Amount card */}
            <div className="bg-hoff-surface rounded-2xl p-5 space-y-3">
              <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest">
                Amount Due
              </p>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-5xl font-bold text-hoff-text-primary tabular-nums">
                  {formatEther(details.amount)}
                </span>
                <span className="text-xl font-medium text-hoff-text-secondary shrink-0">ETH</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-hoff-brand">
                <span className="text-xs text-hoff-text-tertiary">Expires In</span>
                <CountdownTimer expiresAt={Number(details.expiresAt) * 1000} />
              </div>
            </div>

            {/* Creator card */}
            <div className="bg-hoff-surface rounded-2xl p-5 flex items-center gap-3">
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
            {isSuccess && !unlockCode && (
              <div className="text-hoff-accent bg-hoff-accent-muted px-4 py-3 rounded-xl text-sm">
                ✓ Funds deposited
              </div>
            )}
            {txError && (
              <div className="text-red-400 bg-red-900/20 px-4 py-3 rounded-xl text-sm border border-red-800/30">
                Payment failed. Try again.
              </div>
            )}

            {/* CTA button */}
            {details.status === EscrowStatus.PENDING && !isSuccess && (
              <Button
                fullWidth
                onClick={isConnected ? handleDeposit : undefined}
                loading={isPending || isConfirming}
                disabled={isPending || isConfirming}
              >
                {isConnected ? 'Fund Escrow' : 'Connect Wallet To Continue'}
              </Button>
            )}

            {details.status === EscrowStatus.FUNDED && !isSuccess && (
              <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl px-4 py-3">
                <p className="text-sm text-amber-400 text-center">This escrow has already been funded.</p>
              </div>
            )}

            {/* Unlock code — shown after success */}
            {isSuccess && unlockCode && (
              <div className="bg-hoff-surface rounded-2xl p-5">
                <CodeDisplay code={unlockCode} />
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
