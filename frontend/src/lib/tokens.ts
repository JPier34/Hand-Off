import type { Address } from './types'

export interface Token {
  symbol:   string
  name:     string
  decimals: number
  address:  Address | null  // null = native ETH
  mockRate: bigint          // mock rate vs ETH (in token's smallest unit per 1 ETH)
}

// Eth Sepolia token addresses
// USDC: Circle's official testnet deployment
// WETH: Uniswap WETH9 on Sepolia (used as WETH by the Universal Router)
// Note: DAI is omitted — no canonical Uniswap-supported DAI on Eth Sepolia
export const TOKENS: Record<string, Token> = {
  ETH: {
    symbol:   'ETH',
    name:     'Ether',
    decimals: 18,
    address:  null,
    mockRate: 1n,  // 1:1 (identity)
  },
  USDC: {
    symbol:   'USDC',
    name:     'USD Coin',
    decimals: 6,
    address:  '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
    mockRate: 2000_000_000n,  // 2000 USDC (6 dec) per 1 ETH
  },
  WETH: {
    symbol:   'WETH',
    name:     'Wrapped Ether',
    decimals: 18,
    address:  '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' as Address,
    mockRate: 10n ** 18n,  // 1:1 with ETH
  },
}

export type TokenKey = string

export const TOKEN_KEYS = Object.keys(TOKENS)

// Native ETH placeholder used by Uniswap Trading API
export const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

// WETH on Eth Sepolia (Uniswap WETH9)
export const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' as Address

// Look up token info by on-chain address (null = native ETH)
export function getTokenByAddress(addr: Address | null): Token {
  if (!addr) return TOKENS.ETH
  const lower = addr.toLowerCase()
  for (const key of TOKEN_KEYS) {
    const t = TOKENS[key]
    if (t.address && t.address.toLowerCase() === lower) return t
  }
  return { symbol: addr.slice(0, 6), name: 'Unknown', decimals: 18, address: addr, mockRate: 1n }
}

// Get display symbol for a deal's payoutToken
export function payoutSymbol(payoutToken: Address | null): string {
  return getTokenByAddress(payoutToken).symbol
}

// Get decimals for a deal's payoutToken
export function payoutDecimals(payoutToken: Address | null): number {
  return getTokenByAddress(payoutToken).decimals
}
