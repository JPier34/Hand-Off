import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import { type Address } from "viem";
import ReputationBadge from "../components/ReputationBadge";
import DealCard from "../components/DealCard";
import WalletButton from "../components/WalletButton";
import HandOffAbi from "../contracts/HandOff.abi.json";
import {
  loadDeals,
  type StoredDeal,
  type DealInfo,
  type DealStateValue,
  type DealRole,
  DealState,
  DEAL_STATE_LABEL,
} from "../lib/code";
import { lookupEns, shortAddress } from "../lib/ens";
import { formatEther } from "viem";

// ---------------------------------------------------------------------------
// UC-13: Wallet Profile + Transaction History
// - Accepts address or ENS name as route param
// - Resolves ENS (UC-15 reverse lookup)
// - Loads deal history from localStorage (no indexer — see design notes)
// - Reads on-chain state for each stored deal
// - Filter by status and role; sort newest first
// ---------------------------------------------------------------------------

type FilterStatus = "all" | "FUNDED" | "COMPLETED" | "EXPIRED" | "CANCELED";
type FilterRole   = "all" | "seller" | "buyer";

export default function Profile() {
  const { address: addressParam } = useParams<{ address: string }>();
  const { address: connectedAddress, isConnected } = useAccount();
  const navigate = useNavigate();

  const [ensName, setEnsName] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<Address | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterRole, setFilterRole] = useState<FilterRole>("all");

  // Resolve the profile address
  useEffect(() => {
    if (!addressParam) return;

    if (addressParam.startsWith("0x")) {
      setResolvedAddress(addressParam as Address);
      lookupEns(addressParam as Address).then(setEnsName).catch(() => null);
    } else if (addressParam.includes(".")) {
      // ENS name passed — forward-resolve it
      import("../lib/ens").then(({ resolveEns }) => {
        resolveEns(addressParam).then((addr) => {
          if (addr) {
            setResolvedAddress(addr);
            setEnsName(addressParam);
          }
        });
      });
    }
  }, [addressParam]);

  const profileAddress = resolvedAddress ?? (addressParam as Address);
  const displayName = ensName ?? shortAddress(profileAddress);
  const isOwnProfile = connectedAddress?.toLowerCase() === profileAddress?.toLowerCase();

  // Load stored deals for this address (UC-13)
  const storedDeals: StoredDeal[] = profileAddress
    ? loadDeals(profileAddress)
    : [];

  // Apply filters
  const filteredDeals = storedDeals.filter((d) => {
    if (filterRole !== "all" && d.role !== filterRole) return false;
    return true; // status filter applied after on-chain read
  });

  if (!addressParam) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center text-slate-400">
        No address provided.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8 animate-slide-up">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold text-white">
          <span className="text-gradient">Profile</span>
        </h1>
        {isOwnProfile && <p className="text-slate-400 text-sm mt-1">Your on-chain reputation</p>}
      </header>

      {/* Identity + reputation (UC-14) */}
      <ReputationBadge address={profileAddress} ensName={ensName} variant="card" />

      {/* Wallet connection prompt if own profile and not connected */}
      {isOwnProfile && !isConnected && (
        <div className="card text-center space-y-3 py-8">
          <p className="text-slate-400">Connect your wallet to see your full history.</p>
          <div className="flex justify-center"><WalletButton /></div>
        </div>
      )}

      {/* Transaction history */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-white font-semibold text-lg">Transaction history</h2>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as FilterRole)}
              className="input py-1.5 px-3 text-xs w-auto"
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              <option value="seller">As seller</option>
              <option value="buyer">As buyer</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="input py-1.5 px-3 text-xs w-auto"
              aria-label="Filter by status"
            >
              <option value="all">All status</option>
              <option value="FUNDED">Active</option>
              <option value="COMPLETED">Complete</option>
              <option value="EXPIRED">Expired</option>
              <option value="CANCELED">Canceled</option>
            </select>
          </div>
        </div>

        {filteredDeals.length === 0 && (
          <div className="card text-center py-12 text-slate-500">
            <p className="text-2xl mb-3">📋</p>
            <p>No transactions found.</p>
            <p className="text-xs mt-2">
              Deals appear here once you create or fund a HandOff.
            </p>
          </div>
        )}

        {filteredDeals
          .sort((a, b) => b.createdAt - a.createdAt) // newest first
          .map((d) => (
            <DealRow
              key={d.contractAddress}
              deal={d}
              filterStatus={filterStatus}
              onClick={() => navigate(`/fund/${d.contractAddress}`)}
            />
          ))}
      </section>

      {/* ENS subname receipts section */}
      <section className="card space-y-3">
        <h2 className="text-white font-semibold">ENS deal receipts</h2>
        <div className="text-center py-8 text-slate-500 text-sm">
          <p>🏷️ ENS deal receipts coming soon.</p>
          <p className="text-xs mt-2">
            Each completed HandOff mints a{" "}
            <span className="font-mono text-slate-400">deal-N.hand-off.eth</span> subname.
          </p>
        </div>
      </section>

      {/* Create a new deal CTA */}
      {isOwnProfile && (
        <button
          type="button"
          onClick={() => navigate("/")}
          className="btn-primary w-full"
        >
          🤝 Create a new HandOff
        </button>
      )}
    </div>
  );
}

// ── Deal row component (reads live on-chain state) ────────────────────────

function DealRow({
  deal,
  filterStatus,
  onClick,
}: {
  deal: StoredDeal;
  filterStatus: FilterStatus;
  onClick: () => void;
}) {
  const { data: rawDealInfo } = useReadContract({
    address: deal.contractAddress as Address,
    abi: HandOffAbi,
    functionName: "dealInfo",
    query: { staleTime: 60_000 },
  });

  const info = rawDealInfo as
    | [Address, Address, bigint, bigint, number, string, string]
    | undefined;

  const dealInfo: DealInfo | null = info
    ? {
        seller: info[0], buyer: info[1], expiresAt: info[2],
        balance: info[3], state: info[4] as DealStateValue,
        sellerEns: info[5], buyerEns: info[6],
      }
    : null;

  // Apply status filter after on-chain read
  if (filterStatus !== "all" && dealInfo) {
    const stateNum = DealState[filterStatus as keyof typeof DealState];
    if (dealInfo.state !== stateNum) return null;
  }

  const stateLabel =
    dealInfo ? DEAL_STATE_LABEL[dealInfo.state] : "Loading…";
  const counterparty =
    dealInfo
      ? deal.role === "seller"
        ? (dealInfo.buyerEns || shortAddress(dealInfo.buyer))
        : (dealInfo.sellerEns || shortAddress(dealInfo.seller))
      : "—";
  const amount = dealInfo
    ? `${parseFloat(formatEther(dealInfo.balance)).toFixed(4)} ETH`
    : "—";
  const date = new Date(deal.createdAt * 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  const roleLabel = deal.role === "seller" ? "Seller" : "Buyer";

  return (
    <button
      type="button"
      onClick={onClick}
      className="card w-full text-left hover:border-brand-500/50 transition-colors duration-150 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-medium text-sm truncate max-w-[180px] font-mono">
              {deal.contractAddress.slice(0, 10)}…
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-border text-slate-400">
              {roleLabel}
            </span>
          </div>
          <div className="flex gap-3 mt-1.5 text-xs text-slate-400">
            <span>{counterparty}</span>
            <span>·</span>
            <span>{amount}</span>
            <span>·</span>
            <span>{date}</span>
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full bg-surface text-slate-300 border border-surface-border">
          {stateLabel}
        </span>
      </div>
    </button>
  );
}
