import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, type Address, type Hex } from "viem";
import { useCallback, useState } from "react";
import HandOffAbi from "../contracts/HandOff.abi.json";

// ---------------------------------------------------------------------------
// Handles fund(), fundWithSwap() and refund() on HandOff escrow contracts
// UC-17: refund() is called here when expiry is detected
// ---------------------------------------------------------------------------

export interface FundParams {
  contractAddress: Address;
  /** ETH amount as string e.g. "0.5" */
  amountEth: string;
  buyerEns?: string;
}

export interface UseFundResult {
  fund: (params: FundParams) => Promise<void>;
  claimRefund: (contractAddress: Address) => Promise<void>;
  fundTxHash: Hex | undefined;
  refundTxHash: Hex | undefined;
  isFundPending: boolean;
  isFundConfirming: boolean;
  isFundSuccess: boolean;
  isRefundPending: boolean;
  isRefundConfirming: boolean;
  isRefundSuccess: boolean;
  fundError: Error | null;
  refundError: Error | null;
  reset: () => void;
}

export function useHandOffFund(): UseFundResult {
  const [fundError, setFundError] = useState<Error | null>(null);
  const [refundError, setRefundError] = useState<Error | null>(null);

  const {
    writeContractAsync: writeFund,
    data: fundTxHash,
    isPending: isFundPending,
    reset: resetFund,
  } = useWriteContract();

  const {
    writeContractAsync: writeRefund,
    data: refundTxHash,
    isPending: isRefundPending,
    reset: resetRefund,
  } = useWriteContract();

  const { isLoading: isFundConfirming, isSuccess: isFundSuccess } =
    useWaitForTransactionReceipt({ hash: fundTxHash });

  const { isLoading: isRefundConfirming, isSuccess: isRefundSuccess } =
    useWaitForTransactionReceipt({ hash: refundTxHash });

  const fund = useCallback(
    async ({ contractAddress, amountEth, buyerEns = "" }: FundParams) => {
      setFundError(null);
      try {
        await writeFund({
          address: contractAddress,
          abi: HandOffAbi,
          functionName: "fund",
          args: [buyerEns],
          value: parseEther(amountEth),
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setFundError(e);
        throw e;
      }
    },
    [writeFund]
  );

  // UC-17: Claim refund after expiry
  // Catches revert if not yet expired and throws with friendly message
  const claimRefund = useCallback(
    async (contractAddress: Address) => {
      setRefundError(null);
      try {
        await writeRefund({
          address: contractAddress,
          abi: HandOffAbi,
          functionName: "refund",
          args: [],
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        // UC-17 race condition: revert means deal not yet expired
        if (e.message.includes("not expired") || e.message.includes("invalid deal state")) {
          setRefundError(new Error("The deal hasn't expired yet. Please wait and try again."));
        } else {
          setRefundError(e);
        }
        throw e;
      }
    },
    [writeRefund]
  );

  const reset = useCallback(() => {
    resetFund();
    resetRefund();
    setFundError(null);
    setRefundError(null);
  }, [resetFund, resetRefund]);

  return {
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
    reset,
  };
}
