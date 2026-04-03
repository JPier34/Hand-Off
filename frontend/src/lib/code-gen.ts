import { keccak256, toBytes } from 'viem'

// Generate a random 4-digit unlock code client-side.
// Only the buyer sees the plaintext — only the hash goes on-chain.
export function generateUnlockCode(): string {
  const rand = crypto.getRandomValues(new Uint32Array(1))[0]
  return String(rand % 10000).padStart(4, '0')
}

// Hash the code for on-chain storage / verification.
export function hashUnlockCode(code: string): `0x${string}` {
  return keccak256(toBytes(code))
}
