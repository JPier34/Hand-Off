import { useQuery } from "@tanstack/react-query";
import { parseUnits, formatUnits } from "viem";
import {
  getUniswapQuote,
  BASE_SEPOLIA_TOKENS,
  type TokenSymbol,
  type UniswapQuoteResponse,
} from "../lib/uniswap";
import { CHAIN_IDS } from "../lib/chains";

export interface UseUniswapQuoteParams {
  tokenIn: TokenSymbol;
  amountIn: string;
  tokenInDecimals?: number;
  tokenOut?: TokenSymbol;
  slippageTolerance?: number;
  enabled?: boolean;
}

export interface QuoteDisplay {
  outputAmount: string;
  priceImpact: string;
  gasCostUsd: string;
  routeString: string;
  raw: UniswapQuoteResponse;
}

export interface UseUniswapQuoteResult {
  quote: QuoteDisplay | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useUniswapQuote({
  tokenIn,
  amountIn,
  tokenInDecimals = 18,
  tokenOut = "ETH",
  slippageTolerance = 50,
  enabled = true,
}: UseUniswapQuoteParams): UseUniswapQuoteResult {
  const shouldFetch = enabled && !!amountIn && parseFloat(amountIn) > 0;

  const { data, isLoading, isError, error, refetch } = useQuery<UniswapQuoteResponse, Error>({
    queryKey: ["uniswap-quote", tokenIn, amountIn, tokenOut, slippageTolerance],
    queryFn: () =>
      getUniswapQuote({
        tokenInAddress: BASE_SEPOLIA_TOKENS[tokenIn],
        tokenInChainId: CHAIN_IDS.BASE_SEPOLIA,
        tokenOutAddress: BASE_SEPOLIA_TOKENS[tokenOut],
        tokenOutChainId: CHAIN_IDS.BASE_SEPOLIA,
        amount: parseUnits(amountIn, tokenInDecimals).toString(),
        type: "EXACT_INPUT",
        slippageTolerance,
      }),
    enabled: shouldFetch,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  });

  let quote: QuoteDisplay | null = null;
  if (data) {
    quote = {
      outputAmount: parseFloat(formatUnits(BigInt(data.quote), 18)).toFixed(6),
      priceImpact: `${data.priceImpact}%`,
      gasCostUsd: `$${parseFloat(data.gasUseEstimateUSD).toFixed(2)}`,
      routeString: data.routeString,
      raw: data,
    };
  }

  return { quote, isLoading, isError, error: error ?? null, refetch };
}
