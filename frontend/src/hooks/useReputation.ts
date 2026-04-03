import { useReadContract } from "wagmi";
import { formatEther, type Address } from "viem";
import { CHAIN_IDS } from "../lib/chains";
import { getContractAddresses } from "../contracts/addresses";
import HandOffReputationAbi from "../contracts/HandOffReputation.abi.json";

// ---------------------------------------------------------------------------
// UC-14: Read reputation data from HandOffReputation singleton
// ---------------------------------------------------------------------------

export interface ReputationData {
  /** Number of completed deals as seller */
  dealCount: bigint;
  /** Total ETH volume in wei */
  totalVolume: bigint;
  /** Human-readable volume: "12.4 ETH" */
  volumeDisplay: string;
  /** Formatted display: "47 deals · 12.4 ETH" */
  summaryDisplay: string;
  /** True if this address has any history */
  hasHistory: boolean;
}

export interface UseReputationResult {
  reputation: ReputationData | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useReputation(address: Address | undefined): UseReputationResult {
  const reputationAddress =
    getContractAddresses(CHAIN_IDS.BASE_SEPOLIA)?.reputationRegistry;

  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: reputationAddress,
    abi: HandOffReputationAbi,
    functionName: "getReputation",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!reputationAddress,
      staleTime: 60_000,
    },
  });

  let reputation: ReputationData | null = null;

  if (data !== undefined && data !== null) {
    // getReputation returns [dealCount: bigint, totalVolume: bigint]
    const [dealCount, totalVolume] = data as [bigint, bigint];
    const volumeEth = parseFloat(formatEther(totalVolume)).toFixed(2);
    const volumeDisplay = `${volumeEth} ETH`;
    const hasHistory = dealCount > 0n;
    reputation = {
      dealCount,
      totalVolume,
      volumeDisplay,
      summaryDisplay: hasHistory
        ? `${dealCount.toString()} deals · ${volumeDisplay}`
        : "0 deals",
      hasHistory,
    };
  }

  return {
    reputation,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
