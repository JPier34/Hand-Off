import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatUnits } from 'viem'
import { payoutSymbol, payoutDecimals } from '@/lib/tokens'
import { Layout } from '@/components/Layout'
import { EnsName } from '@/components/EnsName'
import { EscrowStatus } from '@/lib/types'
import { useWalletHistory } from '@/hooks/useWalletHistory'
import { useAccount } from 'wagmi'
import { Spinner } from '@/components/ui/Spinner'
import type { Address } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'active' | 'completed' | 'refunded'
type RoleFilter   = 'all' | 'seller' | 'buyer'


// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<EscrowStatus, { label: string; dot: string }> = {
  [EscrowStatus.CREATED]:   { label: 'Awaiting Payment', dot: 'bg-hoff-warn' },
  [EscrowStatus.FUNDED]:    { label: 'Funds Held',       dot: 'bg-hoff-info' },
  [EscrowStatus.COMPLETED]: { label: 'Completed',        dot: 'bg-hoff-accent' },
  [EscrowStatus.EXPIRED]:   { label: 'Refunded',         dot: 'bg-hoff-text-tertiary' },
  [EscrowStatus.CANCELED]:  { label: 'Cancelled',        dot: 'bg-hoff-err' },
}


function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function History() {
  const navigate         = useNavigate()
  const { address }      = useAccount()
  const { entries, isLoading } = useWalletHistory(address as Address | undefined)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter]     = useState<RoleFilter>('all')

  // Filter + sort
  const filtered = entries
    .filter(e => {
      if (statusFilter === 'active')    return e.deal.status === EscrowStatus.CREATED || e.deal.status === EscrowStatus.FUNDED
      if (statusFilter === 'completed') return e.deal.status === EscrowStatus.COMPLETED
      if (statusFilter === 'refunded')  return e.deal.status === EscrowStatus.EXPIRED
      return true
    })
    .filter(e => roleFilter === 'all' || e.role === roleFilter)
    .sort((a, b) => b.date - a.date)

  // Summary stats
  const completed   = entries.filter(e => e.deal.status === EscrowStatus.COMPLETED)
  const totalVolume = completed.reduce((sum, e) => sum + e.deal.amount, 0n)

  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: 'all',       label: 'All' },
    { key: 'active',    label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'refunded',  label: 'Refunded' },
  ]

  const roleOptions: { key: RoleFilter; label: string }[] = [
    { key: 'all',    label: 'All' },
    { key: 'seller', label: 'Seller' },
    { key: 'buyer',  label: 'Buyer' },
  ]

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!address) {
    return (
      <Layout>
        <main className="w-full px-4 sm:max-w-md sm:mx-auto py-12">
          <div className="bg-hoff-surface rounded-2xl p-5 text-center">
            <p className="text-sm text-hoff-text-tertiary">
              Connect your wallet to view your transaction history.
            </p>
          </div>
        </main>
      </Layout>
    )
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24"><Spinner /></div>
      </Layout>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <main className="w-full px-4 sm:max-w-md sm:mx-auto py-4 space-y-4">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-hoff-text-primary">History</h1>
          <p className="text-xs text-hoff-text-tertiary">Your past and active HandOffs</p>
        </div>

        {/* Wallet summary card */}
        <div className="bg-hoff-surface rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-hoff-elevated flex items-center justify-center text-hoff-text-secondary text-sm font-bold">
              {address.slice(2, 4).toUpperCase()}
            </div>
            <div>
              <EnsName address={address} className="text-sm font-mono text-hoff-text-primary" />
              <p className="text-xs text-hoff-text-tertiary">
                {completed.length} deals · {Number(totalVolume) > 0 ? formatUnits(totalVolume, 18) + ' ETH' : '—'} volume
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <div className="flex gap-1.5">
            {statusOptions.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === key
                    ? 'bg-hoff-accent text-hoff-accent-fg'
                    : 'bg-hoff-surface text-hoff-text-tertiary hover:text-hoff-text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {roleOptions.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setRoleFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  roleFilter === key
                    ? 'bg-hoff-accent/20 text-hoff-accent border border-hoff-accent/40'
                    : 'bg-hoff-surface text-hoff-text-tertiary hover:text-hoff-text-secondary border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Transaction list */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="bg-hoff-surface rounded-2xl p-5 text-center">
              <p className="text-sm text-hoff-text-tertiary">
                {entries.length === 0
                  ? 'No deals found on-chain for this wallet.'
                  : 'No transactions match your filters.'}
              </p>
            </div>
          ) : (
            filtered.map((entry) => {
              const { label, dot } = STATUS_CONFIG[entry.deal.status]
              const counterparty   = entry.role === 'seller' ? entry.deal.buyer : entry.deal.seller
              const isZeroAddr     = !counterparty || counterparty === '0x0000000000000000000000000000000000000000'
              const route          = entry.role === 'buyer'
                ? `/pay/${entry.dealId}`
                : `/deal/${entry.dealId}`

              return (
                <button
                  key={Number(entry.dealId)}
                  onClick={() => navigate(route)}
                  className="w-full bg-hoff-surface rounded-2xl p-4 text-left hover:bg-hoff-elevated transition-colors space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-hoff-text-primary truncate">
                        {entry.deal.description || `Deal #${entry.dealId}`}
                      </p>
                      <p className="text-xs text-hoff-text-tertiary mt-0.5">
                        {formatDate(entry.date)}
                      </p>
                    </div>
                    <span className="text-sm font-mono font-semibold text-hoff-text-primary shrink-0">
                      {formatUnits(entry.deal.amount, payoutDecimals(entry.deal.payoutToken))} {payoutSymbol(entry.deal.payoutToken)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                        <span className="text-xs text-hoff-text-tertiary">{label}</span>
                      </div>
                      <span className="text-xs text-hoff-text-tertiary">·</span>
                      <span className={`text-xs font-medium ${entry.role === 'seller' ? 'text-hoff-accent' : 'text-hoff-info'}`}>
                        {entry.role === 'seller' ? 'Selling' : 'Buying'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isZeroAddr && (
                        <EnsName
                          address={counterparty as `0x${string}`}
                          className="text-xs font-mono text-hoff-text-tertiary"
                        />
                      )}

                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

      </main>
    </Layout>
  )
}
