import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { formatEther, type Address } from "viem";
import { useHandOffFund } from "../hooks/useHandOffFund";
import DealCard from "../components/DealCard";
import TokenSelector from "../components/TokenSelector";
import SwapPreview from "../components/SwapPreview";
import WalletButton from "../components/WalletButton";
import EnsInput from "../components/EnsInput";
import ReputationBadge from "../components/ReputationBadge";
import HandOffAbi from "../contracts/HandOff.abi.json";
import {
  DealState,
  type DealInfo,
  type DealStateValue,
  type DealRole,
  loadCode,
  storeDeal,
} from "../lib/code";
import type { TokenSymbol } from "../lib/uniswap";

// ---------------------------------------------------------------------------
// UC-12: View a HandOff (buyer-facing + general deal view)
// UC-17: Auto-expire detection and refund prompt
// ---------------------------------------------------------------------------

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export default function FundDeal() {
  const { contractAddress } = useParams<{ contractAddress: string }>();
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();

  // Form state
  const [buyerEns, setBuyerEns] = useState("");
  const [buyerEnsResolved, setBuyerEnsResolved] = useState<Address | null>(null);
  const [ensBlocksSubmit, setEnsBlocksSubmit] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenSymbol>("ETH");
  const [amountEth, setAmountEth] = useState("");

  const {
    fund,
    claimRefund,
    fundTxHash,
    refundTxHash,
    isFundPending,
    isFundConfirming,
    isFundSuccess,
    isRefundPending,
    isRefundConfirming,
    isRefundSuccess,
    fundError,
    refundError,
  } = useHandOffFund();

  // ── On-chain state read (UC-12) ──────────────────────────────────────────
  const { data: rawDealInfo, isLoading, refetch: refetchDeal } = useReadContract({
    address: contractAddress as Address,
    abi: HandOffAbi,
    functionName: "dealInfo",
    query: { enabled: !!contractAddress },
  });

  const deal = rawDealInfo as
    | [Address, Address, bigint, bigint, number, string, string]
    | undefined;

  const dealInfo: DealInfo | null = deal
    ? {
        seller: deal[0],
        buyer: deal[1],
        expiresAt: deal[2],
        balance: deal[3],
        state: deal[4] as DealStateValue,
        sellerEns: deal[5],
        buyerEns: deal[6],
      }
    : null;

  // ── Role detection (UC-12 state table) ───────────────────────────────────
  const role: DealRole = !isConnected
    ? "observer"
    : address?.toLowerCase() === dealInfo?.seller.toLowerCase()
    ? "seller"
    : "buyer";

  // UC-17: expiry detection — update on countdown reaching zero
  const nowSec = Math.floor(Date.now() / 1000);
  const isExpired =
    dealInfo !== null && Number(dealInfo.expiresAt) < nowSec;
  const isEffectivelyExpired =
    dealInfo?.state === DealState.EXPIRED || (dealInfo?.state === DealState.FUNDED && isExpired);

  // Auto-refresh state on page when expiry crosses zero
  useEffect(() => {
    if (!dealInfo || dealInfo.state !== DealState.FUNDED) return;
    const remaining = Number(dealInfo.expiresAt) - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return;
    const timer = setTimeout(() => refetchDeal(), remaining * 1000 + 1000);
    return () => clearTimeout(timer);
  }, [dealInfo, refetchDeal]);

  // Save deal to localStorage on first load (for UC-13 profile history)
  useEffect(() => {
    if (isConnected && address && contractAddress && dealInfo) {
      storeDeal({
        contractAddress,
        role: "buyer",
        walletAddress: address,
        createdAt: nowSec,
      });
    }
  }, [isConnected, address, contractAddress, !!dealInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // UC-15: block submission when ENS name typed but failed to resolve
  const handleEnsResolve = useCallback(
    (resolved: Address | null) => {
      setBuyerEnsResolved(resolved);
      if (buyerEns.includes(".") && resolved === null) {
        setEnsBlocksSubmit(true);
      } else {
        setEnsBlocksSubmit(false);
      }
    },
    [buyerEns]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleFund(e: React.FormEvent) {
    e.preventDefault();
    if (!contractAddress) return;
    if (ensBlocksSubmit) return;
    await fund({
      contractAddress: contractAddress as Address,
      amountEth,
      buyerEns: buyerEnsResolved ? buyerEns : "",
    });
  }

  // UC-17: claim refund
  async function handleClaimRefund() {
    if (!contractAddress) return;
    try {
      await claimRefund(contractAddress as Address);
    } catch {
      // error displayed in UI via refundError
    }
    // UC-17 race condition: re-fetch state in case revert means the deal wasn't yet expired
    await refetchDeal();
  }

  // ── Guard ────────────────────────────────────────────────────────────────
  if (!contractAddress) {
    return <NotFound />;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto px-4 py-10 space-y-6 animate-slide-up">
      <header>
        <h1 className="text-2xl font-bold text-white">
          {role === "seller" ? "Your " : ""}
          <span className="text-gradient">HandOff</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Funds held safely until you both meet in person.
        </p>
      </header>

      {/* Deal info card (UC-12) */}
      {dealInfo ? (
        <DealCard contractAddress={contractAddress as Address} {...dealInfo} isLoading={isLoading} />
      ) : (
        <DealCard
          contractAddress={contractAddress as Address}
          seller={ZERO_ADDR as Address}
          buyer={ZERO_ADDR as Address}
          expiresAt={0n}
          balance={0n}
          state={DealState.CREATED}
          sellerEns=""
          buyerEns=""
          isLoading
        />
      )}

      {/* Seller reputation (UC-14) */}
      {dealInfo?.seller && dealInfo.seller !== ZERO_ADDR && (
        <ReputationBadge
          address={dealInfo.seller}
          ensName={dealInfo.sellerEns || null}
          variant="card"
        />
      )}

      {/* ── UC-12 STATE TABLE ─────────────────────────────────────────── */}

      {/* CANCELED */}
      {dealInfo?.state === DealState.CANCELED && (
        <div className="card text-center text-slate-400 py-8">
          This HandOff was canceled.
        </div>
      )}

      {/* COMPLETED */}
      {dealInfo?.state === DealState.COMPLETED && (
        <div className="card text-center space-y-3 py-8">
          <p className="text-2xl">✅</p>
          <p className="text-white font-semibold">Handoff complete!</p>
          {/* TODO: Submit Review — add once review contract is ready */}
          <p className="text-xs text-slate-500">Review system coming soon.</p>
        </div>
      )}

      {/* CREATED: Connect wallet to fund */}
      {dealInfo?.state === DealState.CREATED && !isConnected && (
        <div className="card text-center space-y-4 py-8">
          <p className="text-slate-300">Connect your wallet to pay.</p>
          <div className="flex justify-center"><WalletButton /></div>
          <p className="text-xs text-slate-500">Connect wallet to fund</p>
        </div>
      )}

      {/* CREATED: Seller view */}
      {dealInfo?.state === DealState.CREATED && role === "seller" && (
        <div className="card space-y-3">
          <p className="text-slate-300 text-sm font-medium">Your deal is waiting for a buyer.</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(window.location.href)}
              className="btn-primary w-full"
            >
              📋 Copy payment link
            </button>
            <button
              type="button"
              onClick={() => navigate(`/unlock/${contractAddress}`)}
              className="btn-ghost w-full text-sm"
            >
              Go to unlock page
            </button>
            {/* Cancel */}
            <CancelSection contractAddress={contractAddress as Address} onSuccess={refetchDeal} />
          </div>
        </div>
      )}

      {/* CREATED: Buyer — fund form */}
      {dealInfo?.state === DealState.CREATED && role === "buyer" && !isFundSuccess && (
        <form onSubmit={handleFund} className="card space-y-5">
          <h2 className="text-white font-semibold">Pay now</h2>

          <EnsInput
            id="buyer-ens"
            label="Your ENS name (optional)"
            placeholder="you.eth"
            value={buyerEns}
            onChange={setBuyerEns}
            onResolve={handleEnsResolve}
          />

          <TokenSelector value={selectedToken} onChange={setSelectedToken} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="amount" className="text-sm font-medium text-slate-300">
              {selectedToken === "ETH" ? "ETH amount" : `${selectedToken} amount`}
            </label>
            <input
              id="amount"
              type="number"
              step="0.0001"
              min="0.0001"
              value={amountEth}
              onChange={(e) => setAmountEth(e.target.value)}
              placeholder="0.5"
              className="input"
              required
            />
          </div>

          {selectedToken !== "ETH" && amountEth && (
            <SwapPreview tokenIn={selectedToken} amountIn={amountEth} tokenInDecimals={selectedToken === "USDC" ? 6 : 18} />
          )}

          {/* Transaction states (all surfaced — no silent failures) */}
          {isFundPending && (
            <div className="tx-pending">
              ⏳ Confirm in your wallet…
            </div>
          )}
          {isFundConfirming && (
            <div className="tx-pending">
              ⛓ Confirming on-chain… ({fundTxHash?.slice(0, 10)}…)
            </div>
          )}
          {fundError && <div className="tx-error">{fundError.message}</div>}
          {ensBlocksSubmit && (
            <div className="tx-error">Fix the ENS name above before continuing.</div>
          )}

          <button
            type="submit"
            disabled={isFundPending || isFundConfirming || !amountEth || ensBlocksSubmit}
            className="btn-primary w-full"
          >
            {isFundPending ? "⏳ Confirm in wallet…" : isFundConfirming ? "⛓ Confirming…" : "Pay Now"}
          </button>

          <p className="text-xs text-slate-500 text-center">
            Funds are held safely until you meet in person.
          </p>
        </form>
      )}

      {/* FUNDED: Buyer view — show code + countdown */}
      {dealInfo?.state === DealState.FUNDED && role === "buyer" && (
        <ActiveBuyerPanel
          contractAddress={contractAddress}
          expiresAt={dealInfo.expiresAt}
          balance={dealInfo.balance}
        />
      )}

      {/* FUNDED: Seller view — redirect to unlock page */}
      {dealInfo?.state === DealState.FUNDED && role === "seller" && (
        <div className="card space-y-3 text-center">
          <p className="text-white font-semibold">Payment has been received!</p>
          <p className="text-slate-400 text-sm">
            Use the unlock page to enter the code when you&apos;re ready.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/unlock/${contractAddress}`)}
            className="btn-primary w-full"
          >
            Confirm Handoff
          </button>
        </div>
      )}

      {/* FUNDED: Observer view — countdown only */}
      {dealInfo?.state === DealState.FUNDED && role === "observer" && (
        <div className="card text-center space-y-2">
          <p className="text-slate-400 text-sm">Payment is held safely.</p>
          <CountdownDisplay expiresAt={dealInfo.expiresAt} />
        </div>
      )}

      {/* UC-17: EXPIRED — buyer refund CTA */}
      {isEffectivelyExpired && role === "buyer" && !isRefundSuccess && (
        <div className="card border-warning/30 space-y-4">
          <p className="text-warning font-semibold">⌛ This HandOff has expired.</p>
          <p className="text-slate-400 text-sm">
            The seller didn&apos;t confirm the handoff in time.
          </p>
          {isRefundPending && <div className="tx-pending">⏳ Confirm in your wallet…</div>}
          {isRefundConfirming && <div className="tx-pending">⛓ Processing your refund…</div>}
          {refundError && <div className="tx-error">{refundError.message}</div>}
          <button
            type="button"
            disabled={isRefundPending || isRefundConfirming}
            onClick={handleClaimRefund}
            className="btn-primary w-full"
          >
            {isRefundPending || isRefundConfirming ? "Processing…" : "Get your money back"}
          </button>
          <p className="text-xs text-slate-500">
            Note: If you paid with a token swap, your refund will be in ETH.
          </p>
        </div>
      )}

      {/* Refund success */}
      {isRefundSuccess && (
        <div className="card border-success/30 text-center space-y-2 animate-slide-up">
          <p className="text-2xl">✅</p>
          <p className="text-success font-bold">Refund sent!</p>
          <p className="text-slate-400 text-sm">Your ETH has been returned to your wallet.</p>
        </div>
      )}

      {/* Fund success — show stored code */}
      {isFundSuccess && contractAddress && (
        <FundSuccessPanel contractAddress={contractAddress} />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function NotFound() {
  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-3">
      <p className="text-2xl">🔗</p>
      <p className="text-white font-bold">Invalid payment link.</p>
    </div>
  );
}

function CountdownDisplay({ expiresAt }: { expiresAt: bigint }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const diffSec = Math.max(0, Number(expiresAt) - nowSec);
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  return (
    <p className="text-slate-300 font-mono text-lg">
      {diffSec > 0 ? `${h}h ${m}m remaining` : "Expired"}
    </p>
  );
}

function ActiveBuyerPanel({
  contractAddress,
  expiresAt,
  balance,
}: {
  contractAddress: string;
  expiresAt: bigint;
  balance: bigint;
}) {
  const savedCode = loadCode(contractAddress);

  return (
    <div className="card space-y-4">
      <p className="text-white font-semibold">Payment received — waiting for handoff.</p>

      {savedCode && (
        <div className="bg-surface rounded-xl border border-surface-border p-4 text-center">
          <p className="text-xs text-slate-400 mb-2">Your 4-digit code</p>
          <p className="text-5xl font-mono font-bold tracking-[0.4em] text-white uppercase">
            {savedCode}
          </p>
          <p className="text-xs text-slate-500 mt-3">
            Give this code to the seller only when they hand over the item.
          </p>
        </div>
      )}

      {!savedCode && (
        <p className="text-slate-400 text-sm">
          The seller will give you a 4-digit code when you meet. Don&apos;t share it until they hand over the item.
        </p>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">Amount held</span>
        <span className="text-white font-semibold">{parseFloat(formatEther(balance)).toFixed(4)} ETH</span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">Refund window closes</span>
        <CountdownDisplay expiresAt={expiresAt} />
      </div>
    </div>
  );
}

function FundSuccessPanel({ contractAddress }: { contractAddress: string }) {
  const savedCode = loadCode(contractAddress);
  return (
    <div className="card border-success/30 space-y-4 animate-slide-up">
      <p className="text-success font-bold text-lg">✅ Payment sent!</p>
      {savedCode && (
        <div className="bg-surface rounded-xl border border-surface-border p-4 text-center">
          <p className="text-xs text-slate-400 mb-2">Your unlock code</p>
          <p className="text-5xl font-mono font-bold tracking-[0.4em] text-white uppercase">{savedCode}</p>
          <p className="text-xs text-slate-500 mt-3">
            Give this to the seller after they hand over the item.
          </p>
        </div>
      )}
      <p className="text-xs text-slate-500 text-center">
        Save this code — it won&apos;t be shown again after you leave this page.
      </p>
    </div>
  );
}

function CancelSection({
  contractAddress,
  onSuccess,
}: {
  contractAddress: Address;
  onSuccess: () => void;
}) {
  const [show, setShow] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();

  if (!show) {
    return (
      <button
        type="button"
        onClick={() => setShow(true)}
        className="text-xs text-slate-500 hover:text-danger underline text-center w-full mt-1"
      >
        Cancel this HandOff
      </button>
    );
  }

  async function doCancel() {
    setIsCanceling(true);
    setCancelError(null);
    try {
      await writeContractAsync({
        address: contractAddress,
        abi: HandOffAbi,
        functionName: "cancel",
        args: [],
      });
      onSuccess();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setIsCanceling(false);
    }
  }

  return (
    <div className="border border-danger/30 rounded-xl p-3 space-y-2">
      <p className="text-sm text-slate-300">Are you sure you want to cancel?</p>
      {cancelError && <p className="text-xs text-danger">{cancelError}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={doCancel}
          disabled={isCanceling}
          className="btn-danger flex-1 text-sm"
        >
          {isCanceling ? "Canceling…" : "Yes, cancel"}
        </button>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="btn-ghost flex-1 text-sm"
        >
          No
        </button>
      </div>
    </div>
  );
}
