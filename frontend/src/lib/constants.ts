import type { Abi } from 'viem'
import HandOffAbi from '@/contracts/HandOff.abi.json'
import HandOffReputationAbi from '@/contracts/HandOffReputation.abi.json'
import HandOffSubnameAbi from '@/contracts/HandOffSubnameRegistrar.abi.json'

// ─── ABIs ─────────────────────────────────────────────────────────────────────
export const HANDOFF_ABI = HandOffAbi as unknown as Abi
export const REPUTATION_ABI = HandOffReputationAbi as unknown as Abi
export const SUBNAME_ABI = HandOffSubnameAbi as unknown as Abi

// ─── Contract addresses (from .env) ──────────────────────────────────────────
// Reputation registry on Base Sepolia — maps dealId → escrow address
export const REPUTATION_ADDRESS = (
  import.meta.env.VITE_REPUTATION_ADDRESS ?? '0x0000000000000000000000000000000000000000'
) as `0x${string}`

// ENS subname registrar on Ethereum Sepolia
export const SUBNAME_ADDRESS = (
  import.meta.env.VITE_SUBNAME_ADDRESS ?? '0x0000000000000000000000000000000000000000'
) as `0x${string}`

// Uniswap Universal Router on Base Sepolia (for fundWithSwap)
export const UNIVERSAL_ROUTER_ADDRESS = (
  import.meta.env.VITE_UNIVERSAL_ROUTER_ADDRESS ?? '0x492e6456d9528771018deb9e87ef7750ef184104'
) as `0x${string}`

// Legacy alias — keep for backward compat during migration
export const ESCROW_MANAGER_ADDRESS = REPUTATION_ADDRESS
export const MANAGER_ABI = REPUTATION_ABI
