import { parseEther } from 'viem'
import { EscrowStatus } from './types'
import type { Address, DealDetails } from './types'
import { calculateProtocolFee } from './fee'
import { TOKENS } from './tokens'

// MOCK_MODE: development flag only. Set VITE_MOCK=true to bypass wallet/contract calls.
// No hardcoded deal IDs or fake addresses are exposed in production.
export const MOCK_MODE = import.meta.env.VITE_MOCK === 'true'

// Placeholder deal ID returned by useMockCreateDeal — only visible in MOCK_MODE dev sessions.
export const MOCK_DEAL_ID = 1n

const ZERO = '0x0000000000000000000000000000000000000000' as Address
const DEFAULT_PROTOCOL_FEE_BPS = 1n

// ─── Per-deal runtime state (only active when MOCK_MODE=true) ─────────────────

interface MockDealState {
  seller:      Address
  buyer:       Address
  amount:      bigint
  status:      EscrowStatus
  expiresAt:   bigint
  description: string
  sellerEns:   string
  buyerEns:    string
  payoutToken: Address | null
}

function defaultDeal(id: number): MockDealState {
  return {
    seller:      ZERO,
    buyer:       ZERO,
    amount:      parseEther('0.1'),
    status:      EscrowStatus.CREATED,
    expiresAt:   BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
    description: `Deal #${id}`,
    sellerEns:   '',
    buyerEns:    '',
    payoutToken: null,
  }
}

// Scripted presets shown on the Home dev panel so clicking a mock deal
// opens a page that actually matches its label (token, amount, status).
const USDC = TOKENS.USDC?.address ?? null
const WETH = TOKENS.WETH?.address ?? null
const DAI  = TOKENS.DAI?.address  ?? null
const now  = () => Math.floor(Date.now() / 1000)
const inDays  = (d: number) => BigInt(now() + d * 86400)
const agoDays = (d: number) => BigInt(now() - d * 86400)

const PRESETS: Record<number, () => MockDealState> = {
  // ETH — tests the direct deposit path (PAY WITH selector hidden)
  42: () => ({
    seller: ZERO, buyer: ZERO,
    amount: parseEther('0.633'),
    status: EscrowStatus.CREATED,
    expiresAt: inDays(2),
    description: 'iPhone 14 Pro — Facebook Marketplace',
    sellerEns: '', buyerEns: '', payoutToken: null,
  }),
  // USDC (1200) — tests PAY WITH swap path
  35: () => ({
    seller: ZERO, buyer: ZERO,
    amount: 1_200_000_000n, // 1200 USDC (6 dec)
    status: EscrowStatus.CREATED,
    expiresAt: inDays(4),
    description: 'MacBook Air M2 — Vinted',
    sellerEns: '', buyerEns: '', payoutToken: USDC,
  }),
  // USDC (2500) — FUNDED state
  22: () => ({
    seller: ZERO, buyer: ZERO,
    amount: 2_500_000_000n,
    status: EscrowStatus.FUNDED,
    expiresAt: inDays(3),
    description: 'Rolex Submariner — Chrono24',
    sellerEns: '', buyerEns: '', payoutToken: USDC,
  }),
  // DAI (350) — COMPLETED state
  27: () => ({
    seller: ZERO, buyer: ZERO,
    amount: 350n * 10n ** 18n,
    status: EscrowStatus.COMPLETED,
    expiresAt: agoDays(14),
    description: 'Canon EOS R6 — eBay Kleinanzeigen',
    sellerEns: '', buyerEns: '', payoutToken: DAI,
  }),
  // WETH (0.5) — COMPLETED state
  25: () => ({
    seller: ZERO, buyer: ZERO,
    amount: parseEther('0.5'),
    status: EscrowStatus.COMPLETED,
    expiresAt: agoDays(20),
    description: 'Herman Miller Aeron — Craigslist',
    sellerEns: '', buyerEns: '', payoutToken: WETH,
  }),
  // USDC (50) — EXPIRED state
  31: () => ({
    seller: ZERO, buyer: ZERO,
    amount: 50_000_000n,
    status: EscrowStatus.EXPIRED,
    expiresAt: agoDays(2),
    description: 'AirPods Pro — Facebook Marketplace',
    sellerEns: '', buyerEns: '', payoutToken: USDC,
  }),
}

// Runtime state — lazily initialized, mutated by mock action functions
const _deals = new Map<number, MockDealState>()

function getDealState(id: number): MockDealState {
  let state = _deals.get(id)
  if (!state) {
    state = PRESETS[id]?.() ?? defaultDeal(id)
    _deals.set(id, state)
  }
  return state
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getMockDeal(dealId?: bigint): DealDetails {
  const id = Number(dealId ?? 1n)
  const s = getDealState(id)
  const feeAmount = calculateProtocolFee(s.amount, DEFAULT_PROTOCOL_FEE_BPS)
  return {
    seller:      s.seller,
    buyer:       s.buyer,
    amount:      s.amount,
    feeAmount,
    requiredFunding: s.amount + feeAmount,
    feeRecipient: ZERO,
    protocolFeeBps: DEFAULT_PROTOCOL_FEE_BPS,
    status:      s.status,
    expiresAt:   s.expiresAt,
    description: s.description,
    sellerEns:   s.sellerEns,
    buyerEns:    s.buyerEns,
    payoutToken: s.payoutToken,
  }
}

// Mutation helpers — used by BuyerPay / ManageDeal when MOCK_MODE=true
export function mockDeposit(dealId?: bigint) {
  const s = getDealState(Number(dealId ?? 1n))
  s.status = EscrowStatus.FUNDED
}

export function mockRelease(dealId?: bigint) {
  getDealState(Number(dealId ?? 1n)).status = EscrowStatus.COMPLETED
}

export function mockRefund(dealId?: bigint) {
  getDealState(Number(dealId ?? 1n)).status = EscrowStatus.EXPIRED
}

export function mockCancel(dealId?: bigint) {
  getDealState(Number(dealId ?? 1n)).status = EscrowStatus.CANCELED
}

export function mockExpire(dealId?: bigint) {
  getDealState(Number(dealId ?? 1n)).expiresAt = BigInt(Math.floor(Date.now() / 1000) - 60)
}

export function mockEditDeal(dealId: bigint, amount: bigint, description: string) {
  const s = getDealState(Number(dealId))
  s.amount = amount
  s.description = description
}

export function setMockDeal(dealId: bigint, updates: Partial<DealDetails>) {
  const s = getDealState(Number(dealId))
  if (updates.seller !== undefined) s.seller = updates.seller
  if (updates.buyer !== undefined) s.buyer = updates.buyer
  if (updates.amount !== undefined) s.amount = updates.amount
  if (updates.status !== undefined) s.status = updates.status
  if (updates.expiresAt !== undefined) s.expiresAt = updates.expiresAt
  if (updates.description !== undefined) s.description = updates.description
  if (updates.sellerEns !== undefined) s.sellerEns = updates.sellerEns
  if (updates.buyerEns !== undefined) s.buyerEns = updates.buyerEns
  if ('payoutToken' in updates) s.payoutToken = updates.payoutToken ?? null
}

export function resetMock(dealId?: bigint) {
  _deals.delete(Number(dealId ?? 1n))
}
