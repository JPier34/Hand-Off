import { createPublicClient, http, type Address } from "viem";
import { mainnet, sepolia } from "viem/chains";

// ---------------------------------------------------------------------------
// UC-15: ENS resolution helpers
// ENS always resolved on Ethereum (mainnet or Sepolia) — NEVER Base Sepolia.
// For this hackathon deployment we use Eth Sepolia.
// ---------------------------------------------------------------------------

const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_API_KEY ?? "";

// Client targeting Ethereum Sepolia for ENS resolution
export const ensClient = createPublicClient({
  chain: sepolia,
  transport: http(
    ALCHEMY_KEY
      ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`
      : undefined
  ),
});

// ---------------------------------------------------------------------------
// Forward resolution: alice.eth → 0x1234...
// Returns null on failure (name not found or resolution error).
// Callers that need to BLOCK on failure (form submission) must handle null.
// ---------------------------------------------------------------------------
export async function resolveEns(name: string): Promise<Address | null> {
  if (!name?.trim() || !name.includes(".")) return null;
  try {
    const address = await ensClient.getEnsAddress({ name: name.trim() });
    return address ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reverse resolution: 0x1234... → alice.eth
// Returns null silently on failure — callers fall back to truncated address.
// ---------------------------------------------------------------------------
export async function lookupEns(address: Address): Promise<string | null> {
  if (!address) return null;
  try {
    const name = await ensClient.getEnsName({ address });
    return name ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Avatar resolution
// ---------------------------------------------------------------------------
export async function getEnsAvatar(name: string): Promise<string | null> {
  if (!name?.includes(".")) return null;
  try {
    const avatar = await ensClient.getEnsAvatar({ name: name.trim() });
    return avatar ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Display helper: return ENS name if known, otherwise "0xABcd…1234"
// ---------------------------------------------------------------------------
export function shortAddress(address: Address, ensName?: string | null): string {
  if (ensName) return ensName;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
