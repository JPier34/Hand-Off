export const CHAIN_IDS = {
  MAINNET:      1,
  BASE_SEPOLIA: 84532,
  ETH_SEPOLIA:  11155111,
} as const

// VITE_NETWORK=mainnet → chain 1, anything else → Eth Sepolia (default/dev)
export function getTargetChainId(): number {
  return import.meta.env.VITE_NETWORK === 'mainnet'
    ? CHAIN_IDS.MAINNET
    : CHAIN_IDS.ETH_SEPOLIA
}
