import type { Address } from "viem";
import { CHAIN_IDS } from "../lib/chains";

type ContractAddresses = {
  reputationRegistry: Address;
  subnameRegistrar: Address;
  factory: Address;
};

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  [CHAIN_IDS.ETH_SEPOLIA]: {
    reputationRegistry: "0x6F27405a3b38952DF88aea5F1B7F5b546D7a328a" as Address,
    factory:            "0xe6A1B57738eBc3EC39975B0aFcE321d962d3a429" as Address,
    subnameRegistrar:   "0x8e9568CF2F4Aa172DCDc91d320d96B964255226B" as Address,
  },
};

export function getContractAddresses(chainId: number): ContractAddresses | undefined {
  return CONTRACT_ADDRESSES[chainId];
}
