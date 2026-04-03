import { baseSepolia as viemBaseSepolia, sepolia } from "viem/chains";
import type { Chain } from "viem";

export const baseSepolia: Chain = viemBaseSepolia;
export { sepolia };

export const CHAIN_IDS = {
  BASE_SEPOLIA: viemBaseSepolia.id, // 84532
  ETH_SEPOLIA: sepolia.id,          // 11155111
} as const;

export type SupportedChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];
