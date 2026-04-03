import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import { formatEther, type Address } from "viem";
import { useHandOffUnlock } from "../hooks/useHandOffUnlock";
import DealCard from "../components/DealCard";
import WalletButton from "../components/WalletButton";
import ReputationBadge from "../components/ReputationBadge";
import HandOffAbi from "../contracts/HandOff.abi.json";
import {
  DealState,
  type DealInfo,
  type DealStateValue,
  type DealRole,
  isValidCode,
  storeDeal,
} from "../lib/code";

// ---------------------------------------------------------------------------
// UC-12: HandOff detail view (seller-facing)
// UC-16: ENS subname minting after unlock
// UC-17: Expiry detection → redirect to /fund/:addr for buyer refund
// ---------------------------------------------------------------------------

export default function UnlockDeal() {
  const { contractAddress } = useParams<{ contractAddress: string }>();
  const { address, isConnected } = useAccount();

  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const {
    unlock,
    mintReceipt,
    txHash,
    isPending,
    isConfirming,
    isSuccess,
    mintStatus,
    mintError,
    error: unlockError,
    reset,
  } = useHandOffUnlock();

  // ── On-chain state read ───────────────────────────────────────────────────
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

  // Also read DEAL_ID for UC-16 subname minting
  const { data: dealIdRaw } = useReadContract({
    address: contractAddress as Address,
    abi: HandOffAbi,
    functionName: "DEAL_ID",
    query: { enabled: !!contractAddress },
  });
  const dealId = dealIdRaw as bigint | undefined;

  // ── Role detection ────────────────────────────────────────────────────────
  const role: DealRole = !isConnected
    ? "observer"
    : address?.toLowerCase() === dealInfo?.seller.toLowerCase()
    ? "seller"
    : "buyer";

  // UC-17: expiry
  const nowSec = Math.floor(Date.now() / 1000);
  const isExpired =
    dealInfo !== null &&
    Number(dealInfo.expiresAt) < nowSec &&
    dealInfo.state === DealState.FUNDED;

  useEffect(() => {
    if (!dealInfo || dealInfo.state !== DealState.FUNDED) return;
    const remaining = Number(dealInfo.expiresAt) - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return;
    const timer = setTimeout(() => refetchDeal(), remaining * 1000 + 1000);
    return () => clearTimeout(timer);
  }, [dealInfo, refetchDeal]);

  // Save deal to localStorage (UC-13)
  useEffect(() => {
    if (isConnected && address && contractAddress && dealInfo) {
      storeDeal({
        contractAddress,
        role: "seller",
        walletAddress: address,
        createdAt: nowSec,
      });
    }
  }, [isConnected, address, contractAddress, !!dealInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // UC-16: trigger subname minting after unlock confirms
  useEffect(() => {
    if (!isSuccess || !dealInfo || !dealId || !address) return;
    // Non-blocking — fire and forget (error shown via mintStatus)
    mintReceipt({
      dealId,
      buyer: dealInfo.buyer,
      seller: address,
      buyerEns: dealInfo.buyerEns,
      sellerEns: dealInfo.sellerEns,
      amountWei: dealInfo.balance,
    });
  }, [isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleUnlock = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setCodeError(null);
      reset();

      if (!isValidCode(codeInput)) {
        setCodeError("Code must be exactly 4 alphanumeric characters.");
        return;
      }

      try {
        await unlock({
          contractAddress: contractAddress as Address,
          plainCode: codeInput,
        });
      } catch {
        // error exposed via unlockError state
      }
    },
    [codeInput, contractAddress, unlock, reset]
  );

  if (!contractAddress) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center text-slate-400">
        Invalid unlock link.
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto px-4 py-10 space-y-6 animate-slide-up">
      <header>
        <h1 className="text-2xl font-bold text-white">
          Confirm <span className="text-gradient">Handoff</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Enter the code to release funds.
        </p>
      </header>

      {/* Deal info card */}
      {dealInfo ? (
        <DealCard contractAddress={contractAddress as Address} {...dealInfo} isLoading={isLoading} />
      ) : (
        <DealCard
          contractAddress={contractAddress as Address}
          seller={"0x0000000000000000000000000000000000000000" as Address}
          buyer={"0x0000000000000000000000000000000000000000" as Address}
          expiresAt={BigInt(0)} balance={BigInt(0)}
          state={DealState.CREATED} sellerEns="" buyerEns=""
          isLoading
        />
      )}

      {/* Seller reputation */}
      {dealInfo?.seller && (
        <ReputationBadge address={dealInfo.seller} ensName={dealInfo.sellerEns || null} variant="pill" />
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
          {/* UC-16: ENS subname status */}
          {mintStatus === "success" && !!dealId && (
            <p className="text-success text-sm">
              🏷️ Deal receipt minted: deal-{dealId.toString()}.hand-off.eth
            </p>
          )}
          {mintStatus === "error" && mintError && (
            <p className="text-warning text-xs">{mintError}</p>
          )}
          <p className="text-xs text-slate-500">Review system coming soon.</p>
        </div>
      )}

      {/* CREATED: Waiting for buyer */}
      {dealInfo?.state === DealState.CREATED && (
        <div className="card text-center space-y-3 py-8">
          <p className="text-slate-300">Waiting for the buyer to pay.</p>
          <p className="text-xs text-slate-500">
            Share the payment link:{" "}
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/fund/${contractAddress}`)}
              className="text-brand-400 underline"
            >
              Copy link
            </button>
          </p>
        </div>
      )}

      {/* UC-17: EXPIRED — direct buyer to /fund/:addr for refund */}
      {isExpired && dealInfo?.state === DealState.FUNDED && (
        <div className="card border-warning/30 space-y-3">
          <p className="text-warning font-semibold">⌛ This HandOff has expired.</p>
          {role === "seller" && (
            <p className="text-slate-400 text-sm">
              The refund window has passed. The buyer can now claim their refund.
            </p>
          )}
          {role === "buyer" && (
            <a
              href={`/fund/${contractAddress}`}
              className="btn-primary w-full text-center block"
            >
              Get your money back
            </a>
          )}
        </div>
      )}

      {/* FUNDED: Seller — enter code form */}
      {dealInfo?.state === DealState.FUNDED && !isExpired && role === "seller" && !isSuccess && (
        <form onSubmit={handleUnlock} className="card space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="code-input" className="text-sm font-medium text-slate-300">
              4-digit code
            </label>
            <input
              id="code-input"
              type="text"
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value.toLowerCase().trim());
                setCodeError(null);
              }}
              placeholder="a3x9"
              maxLength={4}
              inputMode="text"
              autoComplete="off"
              className="input text-center text-4xl font-mono tracking-[0.5em] uppercase py-5"
              required
            />
            <p className="text-xs text-slate-500 text-center">
              Enter the code the buyer shows you after receiving the item.
            </p>
          </div>

          {codeError && <p className="text-danger text-sm">{codeError}</p>}

          {/* All transaction states surfaced */}
          {isPending && <div className="tx-pending">⏳ Confirm in your wallet…</div>}
          {isConfirming && (
            <div className="tx-pending">
              ⛓ Confirming… ({txHash?.slice(0, 10)}…)
            </div>
          )}
          {unlockError && (
            <div className="tx-error">
              {unlockError.message.includes("incorrect code hash")
                ? "❌ Wrong code — try again."
                : unlockError.message}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || isConfirming || codeInput.length !== 4}
            className="btn-primary w-full text-lg"
          >
            {isPending ? "⏳ Confirm in wallet…" : isConfirming ? "⛓ Releasing funds…" : "Confirm Handoff"}
          </button>

          <p className="text-xs text-slate-500 text-center">
            Amount you&apos;ll receive: {dealInfo.balance ? `${parseFloat(formatEther(dealInfo.balance)).toFixed(4)} ETH` : "—"}
          </p>
        </form>
      )}

      {/* FUNDED: Buyer view — countdown */}
      {dealInfo?.state === DealState.FUNDED && !isExpired && role === "buyer" && (
        <div className="card text-center space-y-3">
          <p className="text-slate-300">Payment held safely while the seller confirms.</p>
          <p className="text-slate-400 text-sm">Show your code to the seller when ready.</p>
        </div>
      )}

      {/* FUNDED: Observer view */}
      {dealInfo?.state === DealState.FUNDED && !isExpired && role === "observer" && (
        <div className="card text-center">
          <p className="text-slate-400 text-sm">Funds are held safely. Connect your wallet to take action.</p>
          <div className="flex justify-center mt-4"><WalletButton /></div>
        </div>
      )}

      {/* Success — UC-16 subname status */}
      {isSuccess && (
        <div className="card border-success/30 text-center space-y-3 animate-slide-up">
          <p className="text-4xl">✅</p>
          <p className="text-success font-bold text-xl">Funds released!</p>
          <p className="text-slate-400 text-sm">ETH sent to your wallet.</p>

          {/* UC-16: Subname minting status */}
          {mintStatus === "pending" && (
            <div className="tx-pending text-xs">🏷️ Minting deal receipt on ENS…</div>
          )}
          {mintStatus === "success" && !!dealId && (
            <div className="tx-success text-xs">
              🏷️ Deal receipt minted: deal-{dealId.toString()}.hand-off.eth
            </div>
          )}
          {mintStatus === "error" && mintError && (
            <div className="tx-error text-xs">
              ⚠️ {mintError}
            </div>
          )}
          {mintStatus === "idle" && (
            <p className="text-xs text-slate-500">Minting deal receipt on ENS…</p>
          )}
        </div>
      )}
    </div>
  );
}
