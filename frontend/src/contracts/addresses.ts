import type { Address } from "viem";
import { CHAIN_IDS } from "../lib/chains";

type ContractAddresses = {
  reputationRegistry: Address;
  subnameRegistrar: Address;
  factory: Address;
};

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  [CHAIN_IDS.BASE_SEPOLIA]: {
    // TODO: fill in after Option A redeploy:
    //   cd contracts && npx hardhat ignition deploy ignition/modules/HandOffFactory.ts --network baseSepolia --reset
    // Old factory (0x1446c3a816e9607F0300c36AAb231fEa65e453aa) used SwapRouter02 — incompatible with Universal Router calldata.
    // Old reputation (0xc5DfcfdC8dDB3CC21f826A273890d4193444D53a) was tied to the old factory.
    reputationRegistry: "0x0000000000000000000000000000000000000000" as Address,
    factory:            "0x0000000000000000000000000000000000000000" as Address,
    subnameRegistrar:   "0x0000000000000000000000000000000000000000" as Address,
  },
  [CHAIN_IDS.ETH_SEPOLIA]: {
    reputationRegistry: "0x0000000000000000000000000000000000000000" as Address,
    factory:            "0x0000000000000000000000000000000000000000" as Address,
    subnameRegistrar:   "0x8e9568CF2F4Aa172DCDc91d320d96B964255226B" as Address,
  },
};

export function getContractAddresses(chainId: number): ContractAddresses | undefined {
  return CONTRACT_ADDRESSES[chainId];
}
