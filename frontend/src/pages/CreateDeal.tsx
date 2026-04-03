import { useState } from "react";
import { useAccount } from "wagmi";
import { useNavigate } from "react-router-dom";
import { useHandOffDeploy } from "../hooks/useHandOffDeploy";
import EnsInput from "../components/EnsInput";
import WalletButton from "../components/WalletButton";
import type { Address } from "viem";

// ---------------------------------------------------------------------------
// CreateDeal — Seller creates a new per-deal escrow
// NOTE: UC-4 is the teammate's scope. This page provides the form shell;
// the deploy hook will become functional once contracts/ teammate compiles.
// ---------------------------------------------------------------------------

const EXPIRY_PRESETS = [
  { label: "1 hour",  seconds: 3_600 },
  { label: "6 hours", seconds: 21_600 },
  { label: "24 hours", seconds: 86_400 },
  { label: "48 hours", seconds: 172_800 },
];

export default function CreateDeal() {
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();

  const [sellerEns, setSellerEns] = useState("");
  const [_ensResolved, setEnsResolved] = useState<Address | null>(null);
  const [ensBlocksSubmit, setEnsBlocksSubmit] = useState(false);
  const [expirySeconds, setExpirySeconds] = useState(86_400);

  const { deploy, deployedAddress, generatedCode, isPending, isConfirming, isSuccess, error } =
    useHandOffDeploy();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!address || ensBlocksSubmit) return;
    await deploy({ seller: address, sellerEns, expirySeconds });
  }

  const shareLink = deployedAddress
    ? `${window.location.origin}/fund/${deployedAddress}`
    : null;
  const unlockLink = deployedAddress
    ? `${window.location.origin}/unlock/${deployedAddress}`
    : null;

  return (
    <div className="max-w-lg mx-auto px-4 py-10 space-y-8 animate-slide-up">
      <header>
        <h1 className="text-2xl font-bold text-white">
          Start a <span className="text-gradient">HandOff</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Create a deal link — share it with your buyer.
        </p>
      </header>

      {!isConnected && (
        <div className="card text-center space-y-4 py-10">
          <p className="text-slate-300">Connect your wallet to create a deal.</p>
          <div className="flex justify-center"><WalletButton /></div>
        </div>
      )}

      {isConnected && !isSuccess && (
        <form onSubmit={handleCreate} className="card space-y-6">
          <EnsInput
            id="seller-ens"
            label="Your ENS name (optional)"
            placeholder="you.eth"
            value={sellerEns}
            onChange={setSellerEns}
            onResolve={(addr) => {
              setEnsResolved(addr);
              setEnsBlocksSubmit(sellerEns.includes(".") && addr === null);
            }}
          />

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">Refund window for buyer</label>
            <div className="grid grid-cols-4 gap-2">
              {EXPIRY_PRESETS.map((p) => (
                <button
                  key={p.seconds}
                  type="button"
                  onClick={() => setExpirySeconds(p.seconds)}
                  className={`py-2 px-3 rounded-xl border text-sm font-medium min-h-[48px] transition-all ${
                    expirySeconds === p.seconds
                      ? "border-brand-500 bg-brand-500/10 text-brand-300"
                      : "border-surface-border text-slate-400 hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              If you don't confirm the handoff, the buyer can get their money back after this time.
            </p>
          </div>

          {isPending && <div className="tx-pending">⏳ Confirm in your wallet…</div>}
          {isConfirming && <div className="tx-pending">⛓ Deploying…</div>}
          {error && <div className="tx-error text-xs">{error.message}</div>}

          <button
            type="submit"
            disabled={isPending || isConfirming || ensBlocksSubmit}
            className="btn-primary w-full"
          >
            {isPending ? "⏳ Confirm in wallet…" : isConfirming ? "⛓ Deploying…" : "🤝 Create HandOff"}
          </button>
        </form>
      )}

      {isSuccess && deployedAddress && (
        <div className="card border-success/30 space-y-5 animate-slide-up">
          <p className="text-success font-bold">✅ HandOff created!</p>

          <div>
            <p className="text-xs text-slate-400 mb-1">Send this to your buyer</p>
            <div className="flex gap-2">
              <input readOnly value={shareLink!} className="input text-xs font-mono" />
              <button type="button" onClick={() => navigator.clipboard.writeText(shareLink!)}
                className="btn-ghost px-3" aria-label="Copy buyer link">📋</button>
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1">Your unlock page (keep private)</p>
            <div className="flex gap-2">
              <input readOnly value={unlockLink!} className="input text-xs font-mono" />
              <button type="button" onClick={() => navigator.clipboard.writeText(unlockLink!)}
                className="btn-ghost px-3" aria-label="Copy unlock link">📋</button>
            </div>
          </div>

          {generatedCode && (
            <div className="bg-surface border border-surface-border rounded-xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-2">Unlock code (give to buyer at the meeting)</p>
              <p className="text-4xl font-mono font-bold tracking-[0.4em] text-white uppercase">
                {generatedCode}
              </p>
            </div>
          )}

          <button onClick={() => navigate("/")} className="btn-ghost w-full">
            Create another HandOff
          </button>
        </div>
      )}
    </div>
  );
}
