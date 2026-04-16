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
    // Deployed post-mainnet launch — fill after Ignition deploy
    reputationRegistry: "0x0000000000000000000000000000000000000000" as Address,
    factory:            "0x0000000000000000000000000000000000000000" as Address,
    subnameRegistrar:   "0x0000000000000000000000000000000000000000" as Address,
  },
[CHAIN_IDS.ETH_SEPOLIA]: {
    // Redeployed 2026-04-15 — EIP-1167 minimal proxy pattern (createHandOff: 1.9M→405k gas).
    // HandOff uses Clones.clone()+initialize(); Factory deploys implementation in constructor.
    // ENS step still required: hand-off.eth owner must call ENS_Registry.setApprovalForAll(
    //   0xb61C34b0da348b65741757fb9b5671f3Fd359d61, true)
    reputationRegistry: "0x2B34136c33DF34B4d1B38Bc9D0DfB73A70b1c6B7" as Address,
    factory:            "0x3d1B1b5D01E008eaEC73309bfbD3AFF0082f018a" as Address,
    subnameRegistrar:   "0xb61C34b0da348b65741757fb9b5671f3Fd359d61" as Address,
  },
};

export function getContractAddresses(chainId: number): ContractAddresses | undefined {
  return CONTRACT_ADDRESSES[chainId];
}
