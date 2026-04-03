import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useReputation } from "../hooks/useReputation";
import { lookupEns, shortAddress } from "../lib/ens";

// ---------------------------------------------------------------------------
// UC-14: ReputationBadge — reusable across payment, profile, and deal detail pages
// Display format: alice.eth · 47 deals · 12.4 ETH volume · 95% positive
// Zero-deal case: "New seller — 0 deals"
// ---------------------------------------------------------------------------

interface ReputationBadgeProps {
  address: Address;
  /** Pre-resolved ENS name (saves an extra lookup) */
  ensName?: string | null;
  /** "card" = full block, "pill" = compact inline */
  variant?: "card" | "pill";
}

export default function ReputationBadge({
  address,
  ensName: externalEnsName,
  variant = "card",
}: ReputationBadgeProps) {
  const { reputation, isLoading } = useReputation(address);
  const [ensName, setEnsName] = useState<string | null>(externalEnsName ?? null);

  useEffect(() => {
    if (!externalEnsName) {
      lookupEns(address).then(setEnsName).catch(() => null);
    }
  }, [address, externalEnsName]);

  const displayName = ensName ?? shortAddress(address);
  const avatarChar = (ensName?.[0] ?? address[2]).toUpperCase();

  // ── Pill variant (compact inline) ────────────────────────────────────────
  if (variant === "pill") {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-card border border-surface-border text-sm min-h-[48px]">
        <span className="w-6 h-6 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-bold shrink-0">
          {avatarChar}
        </span>
        <span className="font-medium text-white truncate max-w-[120px]">{displayName}</span>
        {isLoading && <span className="text-slate-500 text-xs">…</span>}
        {reputation?.hasHistory && (
          <>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400 whitespace-nowrap">{reputation.summaryDisplay}</span>
          </>
        )}
        {reputation && !reputation.hasHistory && (
          <span className="text-slate-500 text-xs">New seller</span>
        )}
      </span>
    );
  }

  // ── Card variant (full block) ─────────────────────────────────────────────
  return (
    <div className="card flex items-start gap-4">
      <div className="w-12 h-12 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xl font-bold shrink-0">
        {avatarChar}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-white font-semibold text-lg leading-tight truncate">{displayName}</h3>
          {/* UC-14: "New seller" badge */}
          {reputation && !reputation.hasHistory && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-surface-border text-slate-400">
              New seller
            </span>
          )}
        </div>
        <p className="text-slate-500 text-xs font-mono truncate mt-0.5">{address}</p>

        {isLoading && (
          <div className="mt-3 flex gap-3">
            <div className="h-4 w-20 bg-surface-border rounded animate-pulse" />
            <div className="h-4 w-16 bg-surface-border rounded animate-pulse" />
          </div>
        )}

        {reputation?.hasHistory && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs">Deals</p>
              <p className="text-white font-semibold">{reputation.dealCount.toString()}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Volume</p>
              <p className="text-white font-semibold">{reputation.volumeDisplay}</p>
            </div>
            {/* Positive review % — shown when contract teammate adds review tracking */}
            {/* <div>
              <p className="text-slate-500 text-xs">Positive</p>
              <p className="text-white font-semibold">{positivePercent}%</p>
            </div> */}
          </div>
        )}

        {reputation && !reputation.hasHistory && (
          <p className="mt-2 text-xs text-slate-500">New seller — 0 deals</p>
        )}
      </div>
    </div>
  );
}
