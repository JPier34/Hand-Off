import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { type Address, type Hex } from "viem";
import { useCallback, useState } from "react";
import HandOffAbi from "../contracts/HandOff.abi.json";
import HandOffSubnameRegistrarAbi from "../contracts/HandOffSubnameRegistrar.abi.json";
import { hashCode, isValidCode } from "../lib/code";
import { getContractAddresses } from "../contracts/addresses";
import { CHAIN_IDS } from "../lib/chains";

// ---------------------------------------------------------------------------
// UC-12 / UC-16: Unlock escrow + optional ENS subname minting
// ---------------------------------------------------------------------------

export type MintStatus = "idle" | "pending" | "success" | "error";

export interface UseUnlockResult {
  unlock: (params: { contractAddress: Address; plainCode: string }) => Promise<void>;
  /** UC-16: mint deal-{id}.hand-off.eth after unlock. Non-blocking. */
  mintReceipt: (params: {
    dealId: bigint;
    buyer: Address;
    seller: Address;
    buyerEns: string;
    sellerEns: string;
    amountWei: bigint;
  }) => Promise<void>;
  txHash: Hex | undefined;
  mintTxHash: Hex | undefined;
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  mintStatus: MintStatus;
  mintError: string | null;
  error: Error | null;
  reset: () => void;
}

export function useHandOffUnlock(): UseUnlockResult {
  const [error, setError] = useState<Error | null>(null);
  const [mintStatus, setMintStatus] = useState<MintStatus>("idle");
  const [mintError, setMintError] = useState<string | null>(null);

  const {
    writeContractAsync: writeUnlock,
    data: txHash,
    isPending,
    reset: resetWrite,
  } = useWriteContract();

  const {
    writeContractAsync: writeMint,
    data: mintTxHash,
  } = useWriteContract();

  const { switchChainAsync } = useSwitchChain();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Core unlock — hashes plainCode client-side before submitting (security: keccak256 match)
  const unlock = useCallback(
    async ({
      contractAddress,
      plainCode,
    }: {
      contractAddress: Address;
      plainCode: string;
    }) => {
      setError(null);

      if (!isValidCode(plainCode)) {
        const e = new Error("Code must be exactly 4 alphanumeric characters.");
        setError(e);
        throw e;
      }

      try {
        const codeHash: Hex = hashCode(plainCode);
        await writeUnlock({
          address: contractAddress,
          abi: HandOffAbi,
          functionName: "unlock",
          args: [codeHash],
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        if (e.message.includes("incorrect code hash")) {
          setError(new Error("That code is incorrect — double-check and try again."));
        } else {
          setError(e);
        }
        throw e;
      }
    },
    [writeUnlock]
  );

  // UC-16: Mint ENS deal receipt — runs on Eth Sepolia, NON-BLOCKING on failure
  const mintReceipt = useCallback(
    async ({
      dealId,
      buyer,
      seller,
      buyerEns,
      sellerEns,
      amountWei,
    }: {
      dealId: bigint;
      buyer: Address;
      seller: Address;
      buyerEns: string;
      sellerEns: string;
      amountWei: bigint;
    }) => {
      const registrarAddress =
        getContractAddresses(CHAIN_IDS.ETH_SEPOLIA)?.subnameRegistrar;

      if (
        !registrarAddress ||
        registrarAddress === "0x0000000000000000000000000000000000000000"
      ) {
        setMintStatus("error");
        setMintError("Subname registrar not configured — receipt not minted.");
        return;
      }

      setMintStatus("pending");
      setMintError(null);

      try {
        // Switch to Eth Sepolia for ENS subname minting
        await switchChainAsync({ chainId: CHAIN_IDS.ETH_SEPOLIA });

        await writeMint({
          address: registrarAddress,
          abi: HandOffSubnameRegistrarAbi,
          functionName: "mintDealSubname",
          args: [
            dealId,
            buyer,
            seller,
            buyerEns,
            sellerEns,
            amountWei,
            BigInt(Math.floor(Date.now() / 1000)),
          ],
          chainId: CHAIN_IDS.ETH_SEPOLIA,
        });

        setMintStatus("success");
      } catch (err) {
        // UC-16 spec: failure must NOT block completion UX — log and show warning only
        console.error("[UC-16] Subname minting failed (non-blocking):", err);
        setMintStatus("error");
        setMintError("Deal receipt could not be minted on ENS — your funds were still released.");
      }
    },
    [writeMint, switchChainAsync]
  );

  const reset = useCallback(() => {
    resetWrite();
    setError(null);
    setMintStatus("idle");
    setMintError(null);
  }, [resetWrite]);

  return {
    unlock,
    mintReceipt,
    txHash,
    mintTxHash,
    isPending,
    isConfirming,
    isSuccess,
    mintStatus,
    mintError,
    error,
    reset,
  };
}
