export type Address = `0x${string}`

export const EscrowStatus = {
  PENDING: 0,
  FUNDED: 1,
  COMPLETE: 2,
  REFUNDED: 3,
  CANCELED: 4,
} as const
export type EscrowStatus = (typeof EscrowStatus)[keyof typeof EscrowStatus]

export interface DealDetails {
  seller: Address
  buyer: Address
  amount: bigint
  status: EscrowStatus
  expiresAt: bigint
  description: string
  payoutToken: Address | null // null = native ETH
}

export interface CreateDealForm {
  amount: string
  description: string
  timeoutHours: number
}
