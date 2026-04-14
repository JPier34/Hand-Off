import type { Address } from "viem";
import { CHAIN_IDS } from "../lib/chains";

type ContractAddresses = {
  reputationRegistry: Address;
  subnameRegistrar: Address;
  factory: Address;
};

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  [CHAIN_IDS.BASE_SEPOLIA]: {
    // Redeployed with Universal Router 2.0 (0x492e6456d9528771018deb9e87ef7750ef184104)
    // Old factory (0x1446c3a) used SwapRouter02 — incompatible with Trading API calldata.
    reputationRegistry: "0x5a9ce883171a4dd2aAD566fDDf60f3ae3c6cD45F" as Address,
    factory:            "0xBCDf737B02638a77d686ccA714a22173724e845a" as Address,
    subnameRegistrar:   "0x0000000000000000000000000000000000000000" as Address,
  },
  [CHAIN_IDS.ETH_SEPOLIA]: {
    // Redeployed 2026-04-14 — Factory now includes buyer-paid protocol fee
    // (FEE_RECIPIENT + PROTOCOL_FEE_BPS params, getFeeAmount / getRequiredFunding views)
    reputationRegistry: "0x79F69A7A38C325D5bd8fE96B111d938981F0d528" as Address,
    factory:            "0xafc9a06b2cfd04dB18882813f17592Aa623801Ad" as Address,
    subnameRegistrar:   "0x8e9568CF2F4Aa172DCDc91d320d96B964255226B" as Address,
  },
};

export function getContractAddresses(chainId: number): ContractAddresses | undefined {
  return CONTRACT_ADDRESSES[chainId];
}
