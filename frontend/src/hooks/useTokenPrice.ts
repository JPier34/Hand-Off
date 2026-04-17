import { useState, useEffect } from 'react'
import { formatUnits } from 'viem'
import type { Address } from '@/lib/types'
import { payoutDecimals, TOKENS, WETH_ADDRESS } from '@/lib/tokens'

// CoinGecko free API — no key needed, 10-30 req/min
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'

let _cachedEthPrice: number | null = null
let _lastFetch = 0
const CACHE_MS = 60_000 // re-fetch every 60s

async function fetchEthPrice(): Promise<number> {
  const now = Date.now()
  if (_cachedEthPrice && now - _lastFetch < CACHE_MS) return _cachedEthPrice

  try {
    const res = await fetch(COINGECKO_URL)
    const data = await res.json()
    _cachedEthPrice = data.ethereum.usd as number
    _lastFetch = now
    return _cachedEthPrice
  } catch {
    return _cachedEthPrice ?? 1800 // fallback
  }
}

// Stablecoin addresses (Eth Sepolia) — assumed $1
const STABLECOIN_ADDRS = new Set([
  TOKENS.USDC.address?.toLowerCase(),
].filter(Boolean) as string[])

function isStablecoin(addr: Address | null): boolean {
  if (!addr) return false
  return STABLECOIN_ADDRS.has(addr.toLowerCase())
}

// WETH = same price as ETH
function isWeth(addr: Address | null): boolean {
  return !!addr && addr.toLowerCase() === WETH_ADDRESS.toLowerCase()
}

/**
 * Returns the USD value of a token amount.
 * - ETH / WETH: fetched from CoinGecko
 * - USDC / DAI: $1 per unit
 * - Unknown: falls back to 0
 */
export function useUsdValue(amount: bigint, payoutToken: Address | null): string | null {
  const [ethPrice, setEthPrice] = useState<number | null>(_cachedEthPrice)

  useEffect(() => {
    fetchEthPrice().then(setEthPrice)
  }, [])

  const decimals = payoutDecimals(payoutToken)
  const parsed = parseFloat(formatUnits(amount, decimals))

  if (isStablecoin(payoutToken)) {
    // USDC = $1 per unit, no API needed
    return parsed.toFixed(2)
  }

  if (!payoutToken || isWeth(payoutToken)) {
    // ETH or WETH
    if (ethPrice === null) return null
    return (parsed * ethPrice).toFixed(2)
  }

  // Unknown token — no price
  return null
}
