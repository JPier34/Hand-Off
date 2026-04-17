import type { Abi } from 'viem'
import HandOffAbi from '@/contracts/HandOff.abi.json'
import HandOffReputationAbi from '@/contracts/HandOffReputation.abi.json'
import HandOffSubnameAbi from '@/contracts/HandOffSubnameRegistrar.abi.json'
import HandOffFactoryAbi from '@/contracts/HandOffFactory.abi.json'
import { CONTRACT_ADDRESSES } from '@/contracts/addresses'
import { getTargetChainId } from '@/lib/chains'

// ─── ABIs ─────────────────────────────────────────────────────────────────────
export const HANDOFF_ABI   = HandOffAbi as unknown as Abi
export const REPUTATION_ABI = HandOffReputationAbi as unknown as Abi
export const SUBNAME_ABI   = HandOffSubnameAbi as unknown as Abi
// FACTORY: entry point for UC-1 — sellers call createHandOff() here
export const FACTORY_ABI   = HandOffFactoryAbi as unknown as Abi

// ─── Contract addresses ──────────────────────────────────────────────────────
// Priority: .env override > addresses.ts for target chain > zero address fallback
// Target chain: VITE_NETWORK=mainnet → 1, anything else → Eth Sepolia (11155111)
const ethAddrs = CONTRACT_ADDRESSES[getTargetChainId()]

// Reputation registry on Eth Sepolia
export const REPUTATION_ADDRESS = (
  import.meta.env.REPUTATION_ADDRESS || ethAddrs?.reputationRegistry || '0x0000000000000000000000000000000000000000'
) as `0x${string}`

// Factory contract on Eth Sepolia — canonical entry point for deal creation (UC-1)
export const FACTORY_ADDRESS = (
  import.meta.env.FACTORY_ADDRESS || ethAddrs?.factory || '0x0000000000000000000000000000000000000000'
) as `0x${string}`

// ENS subname registrar on Ethereum Sepolia — mints deal-{id}.hand-off.eth on unlock()
// VITE_SUBNAME_ADDRESS env var takes precedence; falls back to addresses.ts hardcode.
export const SUBNAME_ADDRESS = (
  import.meta.env.VITE_SUBNAME_ADDRESS || ethAddrs?.subnameRegistrar || '0x0000000000000000000000000000000000000000'
) as `0x${string}`

// Uniswap Universal Router 2.0 on ETH Sepolia — MUST match the address passed to
// HandOffFactory constructor at deployment (verified from ignition journal chain-11155111).
// 0x492e6456... is Universal Router 2.0; the old 0x3fC91A3a... was SwapRouter02 (incompatible).
export const UNIVERSAL_ROUTER_ADDRESS = (
  import.meta.env.VITE_UNIVERSAL_ROUTER_ADDRESS ?? '0x492e6456d9528771018deb9e87ef7750ef184104'
) as `0x${string}`

// Legacy alias — keep for backward compat during migration
export const ESCROW_MANAGER_ADDRESS = REPUTATION_ADDRESS
export const MANAGER_ABI = REPUTATION_ABI
