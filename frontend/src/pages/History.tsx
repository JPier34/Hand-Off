import { useNavigate } from 'react-router-dom'
import { formatEther, formatUnits, parseEther } from 'viem'
import { payoutSymbol, payoutDecimals } from '@/lib/tokens'
import { Layout } from '@/components/Layout'
import { EnsName } from '@/components/EnsName'
import { EscrowStatus } from '@/lib/types'
import type { Address, DealDetails } from '@/lib/types'

// ─── Mock history data ────────────────────────────────────────────────────────

const MOCK_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address

interface HistoryEntry {
  dealId: bigint
  role: 'seller' | 'buyer'
  deal: DealDetails
  date: number // unix ms
  review?: 'positive' | 'negative'
}

const MOCK_HISTORY: HistoryEntry[] = [
  {
    dealId: 42n,
    role: 'seller',
    deal: {
      seller: MOCK_WALLET,
      buyer: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
      amount: parseEther('0.633'),
      status: EscrowStatus.COMPLETE,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) - 3600),
      description: 'iPhone 14 Pro – Facebook Marketplace',
      payoutToken: null,
    },
    date: Date.now() - 2 * 86400_000,
    review: 'positive',
  },
  {
    dealId: 38n,
    role: 'buyer',
    deal: {
      seller: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,
      buyer: MOCK_WALLET,
      amount: parseEther('0.025'),
      status: EscrowStatus.COMPLETE,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) - 86400),
      description: 'PS5 Controller – Kleinanzeigen',
      payoutToken: null,
    },
    date: Date.now() - 5 * 86400_000,
    review: 'positive',
  },
  {
    dealId: 35n,
    role: 'seller',
    deal: {
      seller: MOCK_WALLET,
      buyer: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as Address,
      amount: 1200_000_000n, // 1200 USDC (6 decimals)
      status: EscrowStatus.FUNDED,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400),
      description: 'MacBook Air M2 – Vinted',
      payoutToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address, // USDC
    },
    date: Date.now() - 1 * 86400_000,
  },
  {
    dealId: 31n,
    role: 'buyer',
    deal: {
      seller: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as Address,
      buyer: MOCK_WALLET,
      amount: 50_000_000n, // 50 USDC (6 decimals)
      status: EscrowStatus.REFUNDED,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) - 172800),
      description: 'AirPods Pro – Facebook Marketplace',
      payoutToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address, // USDC
    },
    date: Date.now() - 10 * 86400_000,
  },
  {
    dealId: 29n,
    role: 'seller',
    deal: {
      seller: MOCK_WALLET,
      buyer: '0x0000000000000000000000000000000000000000' as Address,
      amount: parseEther('0.08'),
      status: EscrowStatus.PENDING,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 43200),
      description: 'Nintendo Switch OLED – Marketplace',
      payoutToken: null, // ETH
    },
    date: Date.now() - 6 * 3600_000,
  },
  {
    dealId: 27n,
    role: 'buyer',
    deal: {
      seller: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' as Address,
      buyer: MOCK_WALLET,
      amount: parseEther('350'), // 350 DAI (18 decimals)
      status: EscrowStatus.COMPLETE,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) - 259200),
      description: 'Canon EOS R6 – eBay Kleinanzeigen',
      payoutToken: '0x7683022d84F726a96c4A6611cD31DBf5409C0Ac9' as Address, // DAI
    },
    date: Date.now() - 14 * 86400_000,
    review: 'positive',
  },
  {
    dealId: 25n,
    role: 'seller',
    deal: {
      seller: MOCK_WALLET,
      buyer: '0x976EA74026E726554dB657fA54763abd0C3a0aa9' as Address,
      amount: parseEther('0.5'), // 0.5 WETH
      status: EscrowStatus.COMPLETE,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) - 432000),
      description: 'Herman Miller Aeron – Craigslist',
      payoutToken: '0x4200000000000000000000000000000000000006' as Address, // WETH
    },
    date: Date.now() - 20 * 86400_000,
    review: 'negative',
  },
  {
    dealId: 22n,
    role: 'buyer',
    deal: {
      seller: '0x14dC79964da2C08daa4968307C1AE8E82DACd0da' as Address,
      buyer: MOCK_WALLET,
      amount: 2500_000_000n, // 2500 USDC
      status: EscrowStatus.FUNDED,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 172800),
      description: 'Rolex Submariner – Chrono24',
      payoutToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address, // USDC
    },
    date: Date.now() - 12 * 3600_000,
  },
  {
    dealId: 19n,
    role: 'seller',
    deal: {
      seller: MOCK_WALLET,
      buyer: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as Address,
      amount: parseEther('1.2'),
      status: EscrowStatus.COMPLETE,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) - 604800),
      description: 'Trek Domane SL6 – Bike Exchange',
      payoutToken: null, // ETH
    },
    date: Date.now() - 30 * 86400_000,
    review: 'positive',
  },
]

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<EscrowStatus, { label: string; dot: string }> = {
  [EscrowStatus.PENDING]:  { label: 'Awaiting Payment', dot: 'bg-amber-400' },
  [EscrowStatus.FUNDED]:   { label: 'Funds Held',       dot: 'bg-blue-400' },
  [EscrowStatus.COMPLETE]: { label: 'Completed',        dot: 'bg-hoff-accent' },
  [EscrowStatus.REFUNDED]: { label: 'Refunded',         dot: 'bg-hoff-text-tertiary' },
  [EscrowStatus.CANCELED]: { label: 'Cancelled',        dot: 'bg-red-400' },
}

function reviewIcon(review?: 'positive' | 'negative') {
  if (review === 'positive') {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24">
        <path d="M12 5L20 19H4L12 5Z" fill="#2EBF7A" stroke="#2EBF7A" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    )
  }
  if (review === 'negative') {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24">
        <path d="M12 19L4 5H20L12 19Z" fill="#f87171" stroke="#f87171" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    )
  }
  return null
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Filters ──────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'active' | 'completed' | 'refunded'
type RoleFilter = 'all' | 'seller' | 'buyer'

function matchesStatus(entry: HistoryEntry, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'active') return entry.deal.status === EscrowStatus.PENDING || entry.deal.status === EscrowStatus.FUNDED
  if (filter === 'completed') return entry.deal.status === EscrowStatus.COMPLETE
  return entry.deal.status === EscrowStatus.REFUNDED
}

function matchesRole(entry: HistoryEntry, filter: RoleFilter): boolean {
  if (filter === 'all') return true
  return entry.role === filter
}

// ─── Page ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'

export default function History() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')

  const filtered = MOCK_HISTORY
    .filter(e => matchesStatus(e, statusFilter) && matchesRole(e, roleFilter))
    .sort((a, b) => b.date - a.date)

  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'refunded', label: 'Refunded' },
  ]

  const roleOptions: { key: RoleFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'seller', label: 'Seller' },
    { key: 'buyer', label: 'Buyer' },
  ]

  // Reputation summary
  const completed = MOCK_HISTORY.filter(e => e.deal.status === EscrowStatus.COMPLETE)
  const totalVolume = completed.reduce((sum, e) => sum + e.deal.amount, 0n)
  const positiveCount = MOCK_HISTORY.filter(e => e.review === 'positive').length
  const negativeCount = MOCK_HISTORY.filter(e => e.review === 'negative').length

  return (
    <Layout>
      <main className="max-w-sm mx-auto px-4 py-4 space-y-4">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-hoff-text-primary">History</h1>
          <p className="text-xs text-hoff-text-tertiary">
            Your past and active HandOffs
          </p>
        </div>

        {/* Reputation summary card */}
        <div className="bg-hoff-surface rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-hoff-elevated flex items-center justify-center text-hoff-text-secondary text-sm font-bold">
              {MOCK_WALLET.slice(2, 4).toUpperCase()}
            </div>
            <div>
              <EnsName
                address={MOCK_WALLET}
                className="text-sm font-mono text-hoff-text-primary"
              />
              <p className="text-xs text-hoff-text-tertiary">
                {completed.length} deals · {formatEther(totalVolume)} ETH volume
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24">
                <path d="M12 5L20 19H4L12 5Z" fill="#2EBF7A" stroke="#2EBF7A" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
              <span className="text-xs text-hoff-text-secondary">{positiveCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24">
                <path d="M12 19L4 5H20L12 19Z" fill="#f87171" stroke="#f87171" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
              <span className="text-xs text-hoff-text-secondary">{negativeCount}</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          {/* Status filter */}
          <div className="flex gap-1.5">
            {statusOptions.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === key
                    ? 'bg-hoff-accent text-hoff-bg'
                    : 'bg-hoff-surface text-hoff-text-tertiary hover:text-hoff-text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Role filter */}
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
              <p className="text-sm text-hoff-text-tertiary">No transactions match your filters.</p>
            </div>
          ) : (
            filtered.map((entry) => {
              const { label, dot } = STATUS_CONFIG[entry.deal.status]
              const counterparty = entry.role === 'seller' ? entry.deal.buyer : entry.deal.seller
              const isZeroAddr = counterparty === '0x0000000000000000000000000000000000000000'
              const route = entry.role === 'buyer'
                ? `/pay/${entry.dealId}`
                : `/deal/${entry.dealId}`

              return (
                <button
                  key={Number(entry.dealId)}
                  onClick={() => navigate(route)}
                  className="w-full bg-hoff-surface rounded-2xl p-4 text-left hover:bg-hoff-elevated transition-colors space-y-2"
                >
                  {/* Top row: description + amount */}
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

                  {/* Bottom row: status + role + counterparty + review */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                        <span className="text-xs text-hoff-text-tertiary">{label}</span>
                      </div>
                      <span className="text-xs text-hoff-text-tertiary">·</span>
                      <span className={`text-xs font-medium ${entry.role === 'seller' ? 'text-hoff-accent' : 'text-blue-400'}`}>
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
                      {reviewIcon(entry.review)}
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
