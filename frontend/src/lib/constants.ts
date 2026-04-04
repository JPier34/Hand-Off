import type { Abi } from 'viem'
import HandOffAbi from '@/contracts/HandOff.abi.json'
import HandOffReputationAbi from '@/contracts/HandOffReputation.abi.json'
import HandOffSubnameAbi from '@/contracts/HandOffSubnameRegistrar.abi.json'
import HandOffFactoryAbi from '@/contracts/HandOffFactory.abi.json'
import { CONTRACT_ADDRESSES } from '@/contracts/addresses'
import { CHAIN_IDS } from '@/lib/chains'

// ─── ABIs ─────────────────────────────────────────────────────────────────────
export const HANDOFF_ABI   = HandOffAbi as unknown as Abi
export const REPUTATION_ABI = HandOffReputationAbi as unknown as Abi
export const SUBNAME_ABI   = HandOffSubnameAbi as unknown as Abi
// FACTORY: entry point for UC-1 — sellers call createHandOff() here
export const FACTORY_ABI   = HandOffFactoryAbi as unknown as Abi

// ─── Contract addresses ──────────────────────────────────────────────────────
// Priority: .env override > addresses.ts > zero address fallback
// All core contracts now deployed on Ethereum Sepolia (11155111)
const ethAddrs = CONTRACT_ADDRESSES[CHAIN_IDS.ETH_SEPOLIA]

// Reputation registry on Eth Sepolia
export const REPUTATION_ADDRESS = (
  import.meta.env.REPUTATION_ADDRESS || ethAddrs?.reputationRegistry || '0x0000000000000000000000000000000000000000'
) as `0x${string}`

// Factory contract on Eth Sepolia — canonical entry point for deal creation (UC-1)
export const FACTORY_ADDRESS = (
  import.meta.env.FACTORY_ADDRESS || ethAddrs?.factory || '0x0000000000000000000000000000000000000000'
) as `0x${string}`

// ENS subname registrar on Ethereum Sepolia
export const SUBNAME_ADDRESS = (
  import.meta.env.SUBNAME_ADDRESS || ethAddrs?.subnameRegistrar || '0x0000000000000000000000000000000000000000'
) as `0x${string}`

// Uniswap Universal Router 2.0 on Eth Sepolia (for fundWithSwap)
export const UNIVERSAL_ROUTER_ADDRESS = (
  import.meta.env.UNIVERSAL_ROUTER_ADDRESS ?? '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'
) as `0x${string}`

// Legacy alias — keep for backward compat during migration
export const ESCROW_MANAGER_ADDRESS = REPUTATION_ADDRESS
export const MANAGER_ABI = REPUTATION_ABI
