import { describe, expect, it } from 'vitest'
import { calculateProtocolFee, formatFeePercent } from './fee'

describe('fee helpers', () => {
  it('calculates a 1 bps fee from seller amount', () => {
    expect(calculateProtocolFee(100_000000000000000000n, 1n)).toBe(10_000000000000000n)
  })

  it('returns zero when amount or fee bps is zero', () => {
    expect(calculateProtocolFee(0n, 1n)).toBe(0n)
    expect(calculateProtocolFee(10n, 0n)).toBe(0n)
  })

  it('formats basis points as a percent string', () => {
    expect(formatFeePercent(1n)).toBe('0.01%')
    expect(formatFeePercent(50n)).toBe('0.50%')
  })
})
