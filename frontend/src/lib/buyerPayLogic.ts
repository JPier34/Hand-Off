import { TOKENS, TOKEN_KEYS, type TokenKey } from './tokens'
import type { Address } from './types'

export function getAutoSelectedTokenKey(payoutToken: Address | null): TokenKey {
  const matchedKey = TOKEN_KEYS.find(key => {
    const addr = TOKENS[key].address ?? null
    return (addr ?? '').toLowerCase() === (payoutToken ?? '').toLowerCase()
  })

  return matchedKey ?? 'ETH'
}

export function shouldUseSwapPath(selectedToken: TokenKey, payoutToken: Address | null): boolean {
  const selectedTokenAddr = TOKENS[selectedToken]?.address ?? null
  return selectedToken !== 'ETH' && selectedTokenAddr !== payoutToken
}

export function shouldShowTokenSelector(payoutToken: Address | null): boolean {
  return payoutToken !== null
}
