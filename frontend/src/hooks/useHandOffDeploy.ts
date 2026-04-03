import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { type Address, type Hex } from "viem";
import { useState, useCallback } from "react";
import { generateCode, storeDeal, storeCode } from "../lib/code";
import { getContractAddresses } from "../contracts/addresses";
import { CHAIN_IDS } from "../lib/chains";

// ---------------------------------------------------------------------------
// Deploy a new HandOff.sol instance per deal (no factory pattern)
// Bytecode must be imported after `pnpm compile` generates the artifact.
// ---------------------------------------------------------------------------

export interface DeployParams {
  seller: Address;
  sellerEns: string;
  expirySeconds: number;
}

export interface UseDeployResult {
  deploy: (params: DeployParams) => Promise<{ contractAddress: Address; code: string } | null>;
  deployedAddress: Address | null;
  generatedCode: string | null;
  txHash: Hex | undefined;
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  error: Error | null;
}

export function useHandOffDeploy(): UseDeployResult {
  const [deployedAddress, setDeployedAddress] = useState<Address | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const { data: txHash, isPending, reset } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const publicClient = usePublicClient({ chainId: CHAIN_IDS.BASE_SEPOLIA });

  const deploy = useCallback(
    async ({ seller, sellerEns, expirySeconds }: DeployParams) => {
      setError(null);
      setDeployedAddress(null);
      setGeneratedCode(null);

      try {
        const { code, hash } = generateCode();
        setGeneratedCode(code);

        const addrs = getContractAddresses(CHAIN_IDS.BASE_SEPOLIA);
        const expiresAt = BigInt(Math.floor(Date.now() / 1000) + expirySeconds);

        // TODO: After `pnpm compile`, import bytecode from:
        //   ../../contracts/artifacts/contracts/HandOff.sol/HandOff.json
        // Then deploy with:
        //   await writeContractAsync({ bytecode, abi, args: [...] });
        //
        // For now, usage is blocked with a clear error so the teammate knows.
        void addrs; void expiresAt; void hash;
        throw new Error(
          "HandOff bytecode not yet compiled. Run `pnpm compile` in the contracts/ workspace " +
          "and then import the bytecode into useHandOffDeploy.ts."
        );
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        return null;
      }
    },
    [publicClient]
  );

  // Once tx confirms, extract deployed address from receipt
  if (isSuccess && receipt?.contractAddress && !deployedAddress) {
    const addr = receipt.contractAddress as Address;
    setDeployedAddress(addr);
    if (generatedCode) {
      storeCode(addr, generatedCode);
      storeDeal({
        contractAddress: addr,
        role: "seller",
        walletAddress: "pending", // filled by CreateDeal page with real address
        createdAt: Math.floor(Date.now() / 1000),
      });
    }
  }

  return {
    deploy,
    deployedAddress,
    generatedCode,
    txHash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}
