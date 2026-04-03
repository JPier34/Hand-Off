import { CHAIN_IDS } from "./chains";

// ---------------------------------------------------------------------------
// Uniswap Routing API client (hosted)
// Docs: https://docs.uniswap.org/api/introduction
// ---------------------------------------------------------------------------

const UNISWAP_API_BASE = "https://api.uniswap.org/v2";
const UNISWAP_API_KEY = import.meta.env.VITE_UNISWAP_API_KEY ?? "";

// Common token addresses on Base Sepolia
export const BASE_SEPOLIA_TOKENS = {
  ETH:  "ETH",
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
} as const;

export type TokenSymbol = keyof typeof BASE_SEPOLIA_TOKENS;

export interface UniswapQuoteParams {
  tokenInAddress: string;
  tokenInChainId: number;
  tokenOutAddress: string;
  tokenOutChainId: number;
  amount: string;
  type: "EXACT_INPUT" | "EXACT_OUTPUT";
  slippageTolerance?: number;
}

export interface UniswapQuoteResponse {
  quote: string;
  quoteGasAdjusted: string;
  gasUseEstimateUSD: string;
  routeString: string;
  priceImpact: string;
  blockNumber: string;
}

export async function getUniswapQuote(params: UniswapQuoteParams): Promise<UniswapQuoteResponse> {
  const url = new URL(`${UNISWAP_API_BASE}/quote`);
  url.searchParams.set("tokenInAddress", params.tokenInAddress);
  url.searchParams.set("tokenInChainId", String(params.tokenInChainId));
  url.searchParams.set("tokenOutAddress", params.tokenOutAddress);
  url.searchParams.set("tokenOutChainId", String(params.tokenOutChainId));
  url.searchParams.set("amount", params.amount);
  url.searchParams.set("type", params.type);
  if (params.slippageTolerance !== undefined) {
    url.searchParams.set("slippageTolerance", String(params.slippageTolerance));
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (UNISWAP_API_KEY) headers["x-api-key"] = UNISWAP_API_KEY;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`Uniswap API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<UniswapQuoteResponse>;
}
