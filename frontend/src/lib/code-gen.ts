import { keccak256, toBytes } from 'viem'

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

// Generate a random 4-character alphanumeric unlock code (uppercase).
// Only the buyer sees the plaintext — only the hash goes on-chain.
export function generateUnlockCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('')
}

// Normalize code to uppercase before hashing — enables case-insensitive verification.
// The contract stores keccak256(uppercased code), so the seller can type in any case.
export function hashUnlockCode(code: string): `0x${string}` {
  return keccak256(toBytes(code.toUpperCase()))
}
