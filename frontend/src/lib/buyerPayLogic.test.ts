import { describe, expect, it } from 'vitest'
import { TOKENS } from './tokens'
import { getAutoSelectedTokenKey, shouldShowTokenSelector, shouldUseSwapPath } from './buyerPayLogic'

describe('buyerPayLogic', () => {
  it('defaults to ETH for native ETH escrows', () => {
    expect(getAutoSelectedTokenKey(null)).toBe('ETH')
    expect(shouldShowTokenSelector(null)).toBe(false)
  })

  it('auto-selects the payout token when it is a supported ERC20', () => {
    expect(getAutoSelectedTokenKey(TOKENS.WETH.address)).toBe('WETH')
    expect(getAutoSelectedTokenKey(TOKENS.USDC.address)).toBe('USDC')
  })

  it('uses direct funding when selected token already matches payout token', () => {
    expect(shouldUseSwapPath('USDC', TOKENS.USDC.address)).toBe(false)
    expect(shouldUseSwapPath('WETH', TOKENS.WETH.address)).toBe(false)
  })

  it('uses swap path only for ERC20 inputs that differ from payout token', () => {
    expect(shouldUseSwapPath('ETH', null)).toBe(false)
    expect(shouldUseSwapPath('USDC', TOKENS.WETH.address)).toBe(true)
    expect(shouldUseSwapPath('WETH', TOKENS.USDC.address)).toBe(true)
  })
})
