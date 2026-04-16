export const CHAIN_IDS = {
  MAINNET:     1,
  ETH_SEPOLIA: 11155111,
} as const

// VITE_NETWORK=mainnet → chain 1, anything else → Eth Sepolia (default/dev)
export function getTargetChainId(): number {
  return import.meta.env.VITE_NETWORK === 'mainnet'
    ? CHAIN_IDS.MAINNET
    : CHAIN_IDS.ETH_SEPOLIA
}

// Public RPC for the target chain (uses Alchemy if VITE_ALCHEMY_API_KEY is set)
export function getRpcUrl(): string {
  if (getTargetChainId() === CHAIN_IDS.MAINNET) {
    const key = import.meta.env.VITE_ALCHEMY_API_KEY as string | undefined
    return key ? `https://eth-mainnet.g.alchemy.com/v2/${key}` : 'https://ethereum-rpc.publicnode.com'
  }
  return 'https://ethereum-sepolia-rpc.publicnode.com'
}

// Block explorer base URL for the target chain
export function getExplorerUrl(): string {
  return getTargetChainId() === CHAIN_IDS.MAINNET
    ? 'https://etherscan.io'
    : 'https://sepolia.etherscan.io'
}
