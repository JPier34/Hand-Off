export const BPS_DENOMINATOR = 10_000n

export function calculateProtocolFee(amount: bigint, feeBps: bigint): bigint {
  if (amount <= 0n || feeBps <= 0n) return 0n
  return (amount * feeBps) / BPS_DENOMINATOR
}

export function formatFeePercent(feeBps: bigint): string {
  const percent = Number(feeBps) / 100
  return `${percent.toFixed(2)}%`
}
