import type { Address } from "viem";
import { CHAIN_IDS } from "../lib/chains";

type ContractAddresses = {
  reputationRegistry: Address;
  subnameRegistrar: Address;
};

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  [CHAIN_IDS.BASE_SEPOLIA]: {
    reputationRegistry: (import.meta.env.VITE_REPUTATION_CONTRACT_ADDRESS ??
      "0x0000000000000000000000000000000000000000") as Address,
    subnameRegistrar: "0x0000000000000000000000000000000000000000",
  },
  [CHAIN_IDS.ETH_SEPOLIA]: {
    reputationRegistry: "0x0000000000000000000000000000000000000000",
    subnameRegistrar: (import.meta.env.VITE_SUBNAME_REGISTRAR_ADDRESS ??
      "0x0000000000000000000000000000000000000000") as Address,
  },
};

export function getContractAddresses(chainId: number): ContractAddresses | undefined {
  return CONTRACT_ADDRESSES[chainId];
}
