import type { Address } from "viem";
import { CHAIN_IDS } from "../lib/chains";

// Uniswap Universal Router 2.0 — same address on all EVM chains
export const UNIVERSAL_ROUTER = "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD" as Address;

type ContractAddresses = {
  reputationRegistry: Address;
  subnameRegistrar: Address;
  factory: Address;
};

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  [CHAIN_IDS.MAINNET]: {
    // Deployed 2026-04-17 — EIP-1167 minimal proxy. ENS setApprovalForAll ✅ 2026-04-17 (tx 0xc96fe8b1).
    reputationRegistry: "0x002d35f816A3cD5951C1707D1a91b8e95025655a" as Address,
    factory:            "0x18f7aE8793e6FC61383aaa53F4F0E30F79591559" as Address,
    subnameRegistrar:   "0x3D79a2d7ba642f4AC4EA0C552983Dc076B4A0De0" as Address,
  },
  [CHAIN_IDS.ETH_SEPOLIA]: {
    // Deployed 2026-04-15 — EIP-1167 minimal proxy (createHandOff: 1.9M→405k gas).
    // Verified on Etherscan 2026-04-16. ENS setApprovalForAll ✅ 2026-04-15.
    reputationRegistry: "0x2B34136c33DF34B4d1B38Bc9D0DfB73A70b1c6B7" as Address,
    factory:            "0x3d1B1b5D01E008eaEC73309bfbD3AFF0082f018a" as Address,
    subnameRegistrar:   "0xb61C34b0da348b65741757fb9b5671f3Fd359d61" as Address,
  },
};

export function getContractAddresses(chainId: number): ContractAddresses | undefined {
  return CONTRACT_ADDRESSES[chainId];
}
