import { TOKENS, type TokenKey } from './tokens'
import type { Address } from './types'
import type { QuoteRequest } from './uniswap'

const SEPOLIA_CHAIN_ID = '11155111'

interface BuildQuoteRequestParams {
  swapper?: Address
  tokenKey: TokenKey
  amountOutWei: bigint
  payoutToken: Address | null
}

export function buildExactOutputQuoteRequest({
  swapper,
  tokenKey,
  amountOutWei,
  payoutToken,
}: BuildQuoteRequestParams): QuoteRequest | null {
  const token = TOKENS[tokenKey]

  if (!token || tokenKey === 'ETH' || !swapper || amountOutWei <= 0n || !payoutToken || !token.address) {
    return null
  }

  return {
    swapper,
    tokenIn: token.address,
    tokenOut: payoutToken,
    tokenInChainId: SEPOLIA_CHAIN_ID,
    tokenOutChainId: SEPOLIA_CHAIN_ID,
    amount: amountOutWei.toString(),
    type: 'EXACT_OUTPUT',
    slippageTolerance: 0.5,
  }
}
