import { createPublicClient, http } from 'viem'
import { baseSepolia, mainnet } from 'viem/chains'

/** Base Sepolia public client — used for all contract reads */
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
})

/** Ethereum mainnet public client — used for ENS resolution only */
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http('https://ethereum-rpc.publicnode.com'),
})
