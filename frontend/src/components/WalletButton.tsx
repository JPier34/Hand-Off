import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { lookupEns, shortAddress } from "../lib/ens";
import { CHAIN_IDS } from "../lib/chains";

// ---------------------------------------------------------------------------
// UC-10: Connect Wallet (standard wallets via Dynamic)
// UC-11: Connect via Dynamic Embedded Wallet (email/social — same component)
//
// DynamicWidget handles MetaMask, WalletConnect, Coinbase AND embedded wallets
// in a single UI. The "Don't have a wallet?" path is the email/social embed flow.
// UC-10 ext 3b: wrong network detection + switch prompt via useSwitchChain.
// ---------------------------------------------------------------------------

export default function WalletButton() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { setShowAuthFlow } = useDynamicContext();

  const [ensName, setEnsName] = useState<string | null>(null);
  const [ensLoaded, setEnsLoaded] = useState(false);

  // Reverse-resolve ENS once connected (UC-15)
  if (isConnected && address && !ensLoaded) {
    setEnsLoaded(true);
    lookupEns(address).then(setEnsName).catch(() => null);
  }

  // UC-10 ext 3b: detect wrong network
  const isWrongNetwork =
    isConnected &&
    chain !== undefined &&
    chain.id !== CHAIN_IDS.BASE_SEPOLIA &&
    chain.id !== CHAIN_IDS.ETH_SEPOLIA;

  // -------------------------------------------------------------------------
  // Disconnected: show connect button (triggers DynamicWidget)
  // -------------------------------------------------------------------------
  if (!isConnected) {
    return (
      <div className="flex flex-col items-end gap-1">
        {/* DynamicWidget renders the unified connect + embedded wallet UI */}
        <DynamicWidget />
        {/* UC-11: surfaced as a hint below the main connect button */}
        <button
          type="button"
          onClick={() => setShowAuthFlow(true)}
          className="text-xs text-slate-400 hover:text-brand-400 transition-colors"
          aria-label="Create a new embedded wallet"
        >
          Don&apos;t have a wallet?
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Wrong network banner (UC-10 ext 3b)
  // -------------------------------------------------------------------------
  if (isWrongNetwork) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-warning text-xs font-medium px-3 py-1.5 rounded-lg bg-warning/10 border border-warning/30">
          ⚠️ Wrong network
        </div>
        <button
          type="button"
          disabled={isSwitching}
          onClick={() => switchChain({ chainId: CHAIN_IDS.BASE_SEPOLIA })}
          className="btn-ghost text-xs px-3 py-2"
          aria-label="Switch to Base Sepolia"
        >
          {isSwitching ? "Switching…" : "Switch network"}
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Connected: show identity + DynamicWidget (handles disconnect, account view)
  // -------------------------------------------------------------------------
  return (
    <div className="flex items-center gap-2">
      {address && (
        <span className="hidden sm:inline text-sm font-medium text-slate-300">
          {ensName ?? shortAddress(address)}
        </span>
      )}
      <DynamicWidget />
    </div>
  );
}
