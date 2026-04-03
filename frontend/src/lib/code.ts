import { keccak256, toBytes } from "viem";
import type { Address, Hex } from "viem";

// ---------------------------------------------------------------------------
// Deal state enum — mirrors HandOff.sol State enum (0-indexed)
// ---------------------------------------------------------------------------
export const DealState = {
  CREATED: 0,
  FUNDED: 1,   // displayed as "Active" / "Payment held securely"
  COMPLETED: 2,
  EXPIRED: 3,
  CANCELED: 4,
} as const;

export type DealStateValue = (typeof DealState)[keyof typeof DealState];

export type DealRole = "seller" | "buyer" | "observer";

export interface DealInfo {
  seller: Address;
  buyer: Address;
  expiresAt: bigint;
  balance: bigint;
  state: DealStateValue;
  sellerEns: string;
  buyerEns: string;
}

// Display labels for deal states — no crypto jargon
export const DEAL_STATE_LABEL: Record<DealStateValue, string> = {
  [DealState.CREATED]: "Waiting for payment",
  [DealState.FUNDED]: "Payment held securely",
  [DealState.COMPLETED]: "Complete",
  [DealState.EXPIRED]: "Expired",
  [DealState.CANCELED]: "Canceled",
};

export const DEAL_STATE_BADGE_CLASS: Record<DealStateValue, string> = {
  [DealState.CREATED]: "badge-created",
  [DealState.FUNDED]: "badge-funded",
  [DealState.COMPLETED]: "badge-completed",
  [DealState.EXPIRED]: "badge-expired",
  [DealState.CANCELED]: "badge-canceled",
};

// ---------------------------------------------------------------------------
// 4-digit base36 unlock code utilities (UC-15 — used by CreateDeal + UnlockDeal)
// ---------------------------------------------------------------------------
const BASE36_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
const CODE_LENGTH = 4;

export function generateCode(): { code: string; hash: Hex } {
  const randomBytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(randomBytes);
  const code = Array.from(randomBytes)
    .map((b) => BASE36_CHARS[b % 36])
    .join("");
  return { code, hash: hashCode(code) };
}

export function hashCode(code: string): Hex {
  return keccak256(toBytes(code.toLowerCase().trim()));
}

export function isValidCode(code: string): boolean {
  return /^[0-9a-z]{4}$/.test(code.toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Local deal storage — used by Profile.tsx (UC-13) since there is no indexer
// ---------------------------------------------------------------------------
const DEALS_STORAGE_KEY = "handoff:deals:v1";

export interface StoredDeal {
  contractAddress: string;
  role: DealRole;
  walletAddress: string;
  createdAt: number; // unix seconds
  code?: string;     // plaintext code (buyer stores this for display)
}

export function storeDeal(deal: StoredDeal): void {
  try {
    const existing = loadDeals();
    const idx = existing.findIndex(
      (d) => d.contractAddress.toLowerCase() === deal.contractAddress.toLowerCase()
    );
    if (idx === -1) existing.push(deal);
    else existing[idx] = { ...existing[idx], ...deal };
    localStorage.setItem(DEALS_STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function loadDeals(walletAddress?: string): StoredDeal[] {
  try {
    const raw = localStorage.getItem(DEALS_STORAGE_KEY);
    const all: StoredDeal[] = raw ? (JSON.parse(raw) as StoredDeal[]) : [];
    if (!walletAddress) return all;
    return all.filter(
      (d) => d.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
  } catch {
    return [];
  }
}

export function storeCode(contractAddress: string, code: string): void {
  try {
    localStorage.setItem(`handoff:code:${contractAddress.toLowerCase()}`, code);
  } catch {}
}

export function loadCode(contractAddress: string): string | null {
  try {
    return localStorage.getItem(`handoff:code:${contractAddress.toLowerCase()}`);
  } catch {
    return null;
  }
}
