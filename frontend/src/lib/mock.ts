import { parseEther } from 'viem'
import { EscrowStatus } from './types'
import type { Address, DealDetails } from './types'

// MOCK_MODE: development flag only. Set VITE_MOCK=true to bypass wallet/contract calls.
// No hardcoded deal IDs or fake addresses are exposed in production.
export const MOCK_MODE = import.meta.env.VITE_MOCK === 'true'

// Placeholder deal ID returned by useMockCreateDeal — only visible in MOCK_MODE dev sessions.
export const MOCK_DEAL_ID = 1n

const ZERO = '0x0000000000000000000000000000000000000000' as Address

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

// Runtime state — lazily initialized, mutated by mock action functions
const _deals = new Map<number, MockDealState>()

function getDealState(id: number): MockDealState {
  let state = _deals.get(id)
  if (!state) {
    state = defaultDeal(id)
    _deals.set(id, state)
  }
  return state
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getMockDeal(dealId?: bigint): DealDetails {
  const id = Number(dealId ?? 1n)
  const s = getDealState(id)
  return {
    seller:      s.seller,
    buyer:       s.buyer,
    amount:      s.amount,
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
