import { createConfig, http } from "wagmi";
import { baseSepolia, sepolia } from "./lib/chains";

const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_API_KEY ?? "";

export const wagmiConfig = createConfig({
  chains: [baseSepolia, sepolia],
  transports: {
    [baseSepolia.id]: http(
      ALCHEMY_KEY ? `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}` : undefined
    ),
    [sepolia.id]: http(
      ALCHEMY_KEY ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}` : undefined
    ),
  },
  ssr: false,
});
