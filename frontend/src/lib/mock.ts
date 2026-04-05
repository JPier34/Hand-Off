import { parseEther } from 'viem'
import { EscrowStatus } from './types'
import type { Address, DealDetails } from './types'

export const MOCK_MODE = import.meta.env.MOCK === 'true'

export const MOCK_DEAL_ID = 42n

const MOCK_SELLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address
const MOCK_BUYER  = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address
const ZERO        = '0x0000000000000000000000000000000000000000' as Address

// ─── Per-deal state ──────────────────────────────────────────────────────────

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
  const preset = PRESETS[id]
  if (preset) return { ...preset }
  return {
    seller:      MOCK_SELLER,
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

// Preset data per deal ID — each deal has independent initial state
const PRESETS: Record<number, MockDealState> = {
  42: {
    seller: MOCK_SELLER,
    buyer: ZERO,
    amount: parseEther('0.633'),
    status: EscrowStatus.CREATED,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 2), // 2 days
    description: 'iPhone 14 Pro – Facebook Marketplace',
    sellerEns: '', buyerEns: '',
    payoutToken: null,
  },
  35: {
    seller: MOCK_SELLER,
    buyer: MOCK_BUYER,
    amount: 1200_000_000n, // 1200 USDC
    status: EscrowStatus.FUNDED,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 4), // 4 days
    description: 'MacBook Air M2 – Vinted',
    sellerEns: '', buyerEns: '',
    payoutToken: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
  },
  22: {
    seller: '0x14dC79964da2C08daa4968307C1AE8E82DACd0da' as Address,
    buyer: MOCK_BUYER,
    amount: 2500_000_000n, // 2500 USDC
    status: EscrowStatus.FUNDED,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 3), // 3 days
    description: 'Rolex Submariner – Chrono24',
    sellerEns: '', buyerEns: '',
    payoutToken: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
  },
  27: {
    seller: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' as Address,
    buyer: MOCK_BUYER,
    amount: 350_000_000n, // 350 USDC (6 decimals)
    status: EscrowStatus.COMPLETED,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) - 259200),
    description: 'Canon EOS R6 – eBay Kleinanzeigen',
    sellerEns: '', buyerEns: '',
    payoutToken: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
  },
  25: {
    seller: MOCK_SELLER,
    buyer: '0x976EA74026E726554dB657fA54763abd0C3a0aa9' as Address,
    amount: parseEther('0.5'), // 0.5 WETH
    status: EscrowStatus.COMPLETED,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) - 432000),
    description: 'Herman Miller Aeron – Craigslist',
    sellerEns: '', buyerEns: '',
    payoutToken: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' as Address,
  },
  31: {
    seller: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as Address,
    buyer: MOCK_BUYER,
    amount: 50_000_000n, // 50 USDC
    status: EscrowStatus.EXPIRED,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) - 172800),
    description: 'AirPods Pro – Facebook Marketplace',
    sellerEns: '', buyerEns: '',
    payoutToken: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
  },
  29: {
    seller: MOCK_SELLER,
    buyer: ZERO,
    amount: parseEther('0.08'),
    status: EscrowStatus.CREATED,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 5), // 5 days
    description: 'Nintendo Switch OLED – Marketplace',
    sellerEns: '', buyerEns: '',
    payoutToken: null,
  },
  19: {
    seller: MOCK_SELLER,
    buyer: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as Address,
    amount: parseEther('1.2'),
    status: EscrowStatus.COMPLETED,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) - 604800),
    description: 'Trek Domane SL6 – Bike Exchange',
    sellerEns: '', buyerEns: '',
    payoutToken: null,
  },
  38: {
    seller: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,
    buyer: MOCK_BUYER,
    amount: parseEther('0.025'),
    status: EscrowStatus.COMPLETED,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) - 86400),
    description: 'PS5 Controller – Kleinanzeigen',
    sellerEns: '', buyerEns: '',
    payoutToken: null,
  },
}

// Runtime state — lazily initialized from presets, then mutated independently
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
  const id = Number(dealId ?? MOCK_DEAL_ID)
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

export function mockDeposit(dealId?: bigint) {
  const s = getDealState(Number(dealId ?? MOCK_DEAL_ID))
  s.status = EscrowStatus.FUNDED
  s.buyer = MOCK_BUYER
}

export function mockRelease(dealId?: bigint) {
  const s = getDealState(Number(dealId ?? MOCK_DEAL_ID))
  s.status = EscrowStatus.COMPLETED
}

export function mockRefund(dealId?: bigint) {
  const s = getDealState(Number(dealId ?? MOCK_DEAL_ID))
  s.status = EscrowStatus.EXPIRED
}

export function mockCancel(dealId?: bigint) {
  const s = getDealState(Number(dealId ?? MOCK_DEAL_ID))
  s.status = EscrowStatus.CANCELED
}

export function mockExpire(dealId?: bigint) {
  const s = getDealState(Number(dealId ?? MOCK_DEAL_ID))
  s.expiresAt = BigInt(Math.floor(Date.now() / 1000) - 60)
}

export function mockEditDeal(dealId: bigint, amount: bigint, description: string) {
  const s = getDealState(Number(dealId))
  s.amount = amount
  s.description = description
}

export function resetMock(dealId?: bigint) {
  _deals.delete(Number(dealId ?? MOCK_DEAL_ID))
}
