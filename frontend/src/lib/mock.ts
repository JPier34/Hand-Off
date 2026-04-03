import { parseEther } from 'viem'
import { EscrowStatus } from './types'
import type { Address, DealDetails } from './types'

export const MOCK_MODE = import.meta.env.VITE_MOCK === 'true'

export const MOCK_DEAL_ID = 42n

const MOCK_SELLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address
const MOCK_BUYER  = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address
const ZERO        = '0x0000000000000000000000000000000000000000' as Address

// Module-level state — simulates on-chain escrow across components
let _status:    EscrowStatus = EscrowStatus.PENDING
let _buyer:     Address      = ZERO
let _expiresAt: bigint       = BigInt(Math.floor(Date.now() / 1000) + 86400 * 7)

export function getMockDeal(): DealDetails {
  return {
    seller:      MOCK_SELLER,
    buyer:       _buyer,
    amount:      parseEther('0.05'),
    status:      _status,
    expiresAt:   _expiresAt,
    description: 'iPhone 14 Pro – Facebook Marketplace',
  }
}

export function mockDeposit() { _status = EscrowStatus.FUNDED;   _buyer = MOCK_BUYER }
export function mockRelease() { _status = EscrowStatus.COMPLETE }
export function mockRefund()  { _status = EscrowStatus.REFUNDED }
export function mockExpire()  { _expiresAt = BigInt(Math.floor(Date.now() / 1000) - 60) } // expired 1 min ago
export function resetMock()   { _status = EscrowStatus.PENDING; _buyer = ZERO; _expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400 * 7) }
