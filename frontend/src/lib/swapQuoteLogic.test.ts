import { describe, expect, it } from 'vitest'
import { TOKENS } from './tokens'
import { buildExactOutputQuoteRequest } from './swapQuoteLogic'

const SWAPPER = '0x1111111111111111111111111111111111111111' as const

describe('swapQuoteLogic', () => {
  it('does not build a quote for ETH-input funding', () => {
    expect(buildExactOutputQuoteRequest({
      swapper: SWAPPER,
      tokenKey: 'ETH',
      amountOutWei: 1n,
      payoutToken: TOKENS.WETH.address,
    })).toBeNull()
  })

  it('does not build a quote for native ETH escrows', () => {
    expect(buildExactOutputQuoteRequest({
      swapper: SWAPPER,
      tokenKey: 'USDC',
      amountOutWei: 1n,
      payoutToken: null,
    })).toBeNull()
  })

  it('uses the escrow payout token as tokenOut', () => {
    const request = buildExactOutputQuoteRequest({
      swapper: SWAPPER,
      tokenKey: 'USDC',
      amountOutWei: 123n,
      payoutToken: TOKENS.WETH.address,
    })

    expect(request).toMatchObject({
      swapper: SWAPPER,
      tokenIn: TOKENS.USDC.address,
      tokenOut: TOKENS.WETH.address,
      amount: '123',
      type: 'EXACT_OUTPUT',
    })
  })

  it('keeps same-token ERC20 escrows pointed at the ERC20 payout token', () => {
    const request = buildExactOutputQuoteRequest({
      swapper: SWAPPER,
      tokenKey: 'USDC',
      amountOutWei: 456n,
      payoutToken: TOKENS.USDC.address,
    })

    expect(request?.tokenOut).toBe(TOKENS.USDC.address)
  })
})
