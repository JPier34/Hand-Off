import { formatUnits } from 'viem'

/**
 * Format a bigint token amount as a plain, human-readable decimal string.
 *
 * Never emits scientific notation (e.g. "1.2e-9") and never leaves trailing
 * zeros. Falls back to "<0.0001" for positive amounts too small to show with
 * the chosen precision so the user still knows the value is non-zero.
 */
export function formatTokenAmount(value: bigint, decimals: number, maxFractionDigits = 6): string {
  if (value === 0n) return '0'

  const full = formatUnits(value, decimals)
  const [intPart, fracPart = ''] = full.split('.')

  // Large numbers: show the whole-integer part (viem never stringifies in e-notation)
  if (intPart !== '0' && intPart !== '-0') {
    if (!fracPart) return intPart
    const trimmed = fracPart.slice(0, maxFractionDigits).replace(/0+$/, '')
    return trimmed ? `${intPart}.${trimmed}` : intPart
  }

  // Tiny numbers: trim to max digits, still cut trailing zeros
  const trimmed = fracPart.slice(0, maxFractionDigits).replace(/0+$/, '')
  if (trimmed) return `0.${trimmed}`

  // Positive but too small to display at this precision
  return `<0.${'0'.repeat(maxFractionDigits - 1)}1`
}
