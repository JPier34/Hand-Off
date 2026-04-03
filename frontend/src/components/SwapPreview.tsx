import { useUniswapQuote } from "../hooks/useUniswapQuote";
import type { TokenSymbol } from "../lib/uniswap";

interface SwapPreviewProps {
  tokenIn: TokenSymbol;
  amountIn: string;
  tokenInDecimals?: number;
  onQuoteReady?: (outputEth: string) => void;
}

export default function SwapPreview({
  tokenIn,
  amountIn,
  tokenInDecimals = 6,
  onQuoteReady,
}: SwapPreviewProps) {
  const { quote, isLoading, isError, error } = useUniswapQuote({
    tokenIn,
    amountIn,
    tokenInDecimals,
    tokenOut: "ETH",
    enabled: parseFloat(amountIn) > 0,
  });

  if (quote && onQuoteReady) onQuoteReady(quote.outputAmount);
  if (!amountIn || parseFloat(amountIn) <= 0) return null;

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-4 space-y-3 animate-fade-in">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Swap via Uniswap</span>
        {isLoading && <span className="flex items-center gap-1">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Getting quote…
        </span>}
      </div>
      {isError && <p className="text-danger text-xs">{error?.message ?? "Quote unavailable"}</p>}
      {quote && (
        <>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-white">{amountIn} {tokenIn}</span>
            <span className="text-slate-400">→</span>
            <span className="text-brand-400 font-bold">{quote.outputAmount} ETH</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-slate-500">Price impact</p>
              <p className={parseFloat(quote.priceImpact) > 1 ? "text-warning font-medium" : "text-slate-300"}>
                {quote.priceImpact}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Gas est.</p>
              <p className="text-slate-300">{quote.gasCostUsd}</p>
            </div>
            <div>
              <p className="text-slate-500">Route</p>
              <p className="text-slate-300">{quote.routeString.split("→").length - 1} hop</p>
            </div>
          </div>
          {parseFloat(quote.priceImpact) > 1 && (
            <p className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">
              ⚠️ High price impact — consider a smaller amount.
            </p>
          )}
          <p className="text-slate-600 text-xs">Quote refreshes every 15s</p>
        </>
      )}
    </div>
  );
}
