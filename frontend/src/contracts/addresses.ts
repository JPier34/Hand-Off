import type { Address } from "viem";
import { CHAIN_IDS } from "../lib/chains";

type ContractAddresses = {
  reputationRegistry: Address;
  subnameRegistrar: Address;
  factory: Address;
};

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  [CHAIN_IDS.ETH_SEPOLIA]: {
    // Redeployed 2026-04-05 — Factory now wired to SubnameRegistrar (UC-16 ENS minting)
    // + UNISWAP_ROUTER updated to Universal Router 2.0 on Eth Sepolia
    reputationRegistry: "0x63838546767C30202DFAf52C3fB8bd99ce81B771" as Address,
    factory:            "0xE694B02924897dC0E11eFb283E4E3E0c2BEDeA3C" as Address,
    subnameRegistrar:   "0x8e9568CF2F4Aa172DCDc91d320d96B964255226B" as Address,
  },
};

export function getContractAddresses(chainId: number): ContractAddresses | undefined {
  return CONTRACT_ADDRESSES[chainId];
}
