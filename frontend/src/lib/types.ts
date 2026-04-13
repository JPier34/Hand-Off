export type Address = `0x${string}`

// Matches HandOff.sol enum State { Created, Funded, Completed, Expired, Canceled }
export const EscrowStatus = {
  CREATED:   0,
  FUNDED:    1,
  COMPLETED: 2,
  EXPIRED:   3,
  CANCELED:  4,
} as const
export type EscrowStatus = (typeof EscrowStatus)[keyof typeof EscrowStatus]

export interface DealDetails {
  seller: Address
  buyer: Address
  amount: bigint
  feeAmount: bigint
  requiredFunding: bigint
  feeRecipient: Address | null
  protocolFeeBps: bigint
  status: EscrowStatus
  expiresAt: bigint
  description: string          // frontend-only, not on-chain
  sellerEns: string
  buyerEns: string
  payoutToken: Address | null  // null = native ETH
}

export interface CreateDealForm {
  amount: string
  description: string
  timeoutHours: number
}
