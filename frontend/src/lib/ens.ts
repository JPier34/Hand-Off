/**
 * ENS utilities for HandOff
 *
 * Three concerns:
 * 1. Forward resolution  — name.eth → address  (mainnet)
 * 2. Reverse resolution  — address  → name.eth  (mainnet)
 * 3. Deal subnames       — deal-{id}.hand-off.eth helpers
 */

import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import type { Address } from 'viem'

// ─── Shared mainnet client ────────────────────────────────────────────────────
// ENS resolution always runs on mainnet, regardless of the app's active chain.

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http('https://ethereum-rpc.publicnode.com'),
})

// ─── In-memory caches (session lifetime) ─────────────────────────────────────

const forwardCache = new Map<string, Address | null>()  // name  → address
const reverseCache = new Map<string, string | null>()   // addr  → name

// ─── Forward resolution: name → address ──────────────────────────────────────

/**
 * Resolve an ENS name to its address on mainnet.
 * Returns null if the name does not resolve.
 */
export async function resolveEnsName(name: string): Promise<Address | null> {
  if (!name.endsWith('.eth') || name.length <= 4) return null
  const key = name.toLowerCase()
  if (forwardCache.has(key)) return forwardCache.get(key)!
  try {
    const addr = await mainnetClient.getEnsAddress({ name: key })
    forwardCache.set(key, addr ?? null)
    return addr ?? null
  } catch {
    forwardCache.set(key, null)
    return null
  }
}

// ─── Reverse resolution: address → name ──────────────────────────────────────

/**
 * Resolve an Ethereum address to its primary ENS name on mainnet.
 * Returns null if no reverse record is set.
 */
export async function resolveEnsAddress(address: Address): Promise<string | null> {
  const key = address.toLowerCase()
  if (reverseCache.has(key)) return reverseCache.get(key)!
  try {
    const name = await mainnetClient.getEnsName({ address })
    reverseCache.set(key, name ?? null)
    return name ?? null
  } catch {
    reverseCache.set(key, null)
    return null
  }
}

// ─── Deal subname helpers (Eth Sepolia ENS) ───────────────────────────────────

/**
 * Returns the ENS subname string for a given deal ID.
 * Example: computeDealSubname(42n) → "deal-42.hand-off.eth"
 */
export function computeDealSubname(dealId: bigint): string {
  return `deal-${dealId}.hand-off.eth`
}

/**
 * Returns the ENS app URL for a deal subname.
 * Example: dealSubnameUrl(42n) → "https://app.ens.domains/deal-42.hand-off.eth"
 */
export function dealSubnameUrl(dealId: bigint): string {
  return `https://app.ens.domains/${computeDealSubname(dealId)}`
}

// ─── Display helper ───────────────────────────────────────────────────────────

/**
 * Returns a short display string: "0x1234...abcd"
 */
export function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
