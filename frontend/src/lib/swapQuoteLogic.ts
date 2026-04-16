import { TOKENS, type TokenKey } from './tokens'
import type { Address } from './types'
import type { QuoteRequest } from './uniswap'
import { getTargetChainId } from './chains'

interface BuildQuoteRequestParams {
  swapper?: Address
  tokenKey: TokenKey
  amountOutWei: bigint
  payoutToken: Address | null
  slippage?: number
}

export function buildExactOutputQuoteRequest({
  swapper,
  tokenKey,
  amountOutWei,
  payoutToken,
  slippage = 0.5,
}: BuildQuoteRequestParams): QuoteRequest | null {
  const token = TOKENS[tokenKey]

  if (!token || tokenKey === 'ETH' || !swapper || amountOutWei <= 0n || !payoutToken || !token.address) {
    return null
  }

  const chainId = String(getTargetChainId())

  return {
    swapper,
    tokenIn: token.address,
    tokenOut: payoutToken,
    tokenInChainId: chainId,
    tokenOutChainId: chainId,
    amount: amountOutWei.toString(),
    type: 'EXACT_OUTPUT',
    slippageTolerance: slippage,
  }
}
