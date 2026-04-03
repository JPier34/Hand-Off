import { formatEther, type Address } from "viem";
import {
  DealState,
  DEAL_STATE_LABEL,
  DEAL_STATE_BADGE_CLASS,
  type DealInfo,
} from "../lib/code";

// ---------------------------------------------------------------------------
// DealCard: shows deal state, amount, parties, expiry countdown
// Used on FundDeal and UnlockDeal pages (UC-12)
// ---------------------------------------------------------------------------

interface DealCardProps extends DealInfo {
  contractAddress: Address;
  isLoading?: boolean;
}

function useCountdown(expiresAt: bigint): { label: string; isExpired: boolean } {
  const nowSec = Math.floor(Date.now() / 1000);
  const diffSec = Number(expiresAt) - nowSec;
  const isExpired = diffSec <= 0;

  if (isExpired) return { label: "Expired", isExpired: true };
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return { label, isExpired: false };
}

export default function DealCard({
  contractAddress,
  seller,
  buyer,
  sellerEns,
  buyerEns,
  expiresAt,
  balance,
  state,
  isLoading = false,
}: DealCardProps) {
  const { label: countdownLabel, isExpired } = useCountdown(expiresAt);

  if (isLoading) {
    return (
      <div className="card animate-pulse space-y-4">
        <div className="h-4 bg-surface-border rounded w-1/3" />
        <div className="h-8 bg-surface-border rounded w-2/3" />
        <div className="h-4 bg-surface-border rounded w-1/2" />
      </div>
    );
  }

  const badgeClass = DEAL_STATE_BADGE_CLASS[state];
  const stateLabel = DEAL_STATE_LABEL[state];
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const hasBuyer = buyer !== ZERO_ADDR;

  return (
    <div className="card space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-400 font-medium">Deal Contract</span>
        <span className={badgeClass}>{stateLabel}</span>
      </div>

      {/* Address */}
      <p className="font-mono text-xs text-slate-500 break-all">{contractAddress}</p>

      {/* Amount */}
      <div>
        <p className="text-slate-400 text-xs mb-1">Amount held</p>
        <p className="text-3xl font-bold text-white">
          {parseFloat(formatEther(balance)).toFixed(4)}{" "}
          <span className="text-brand-400 text-xl">ETH</span>
        </p>
      </div>

      {/* Parties */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-xl p-3 border border-surface-border">
          <p className="text-slate-500 text-xs mb-1">Seller</p>
          <p className="text-white text-sm font-medium truncate">
            {sellerEns || `${seller.slice(0, 6)}…${seller.slice(-4)}`}
          </p>
        </div>
        <div className="bg-surface rounded-xl p-3 border border-surface-border">
          <p className="text-slate-500 text-xs mb-1">Buyer</p>
          <p className="text-white text-sm font-medium truncate">
            {hasBuyer
              ? (buyerEns || `${buyer.slice(0, 6)}…${buyer.slice(-4)}`)
              : "—"}
          </p>
        </div>
      </div>

      {/* Expiry */}
      {state === DealState.FUNDED && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Refund window</span>
          <span className={`font-medium ${isExpired ? "text-danger" : "text-slate-200"}`}>
            {countdownLabel}
          </span>
        </div>
      )}
    </div>
  );
}
