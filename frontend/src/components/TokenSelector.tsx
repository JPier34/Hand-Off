import { BASE_SEPOLIA_TOKENS, type TokenSymbol } from "../lib/uniswap";

const TOKEN_META: Record<TokenSymbol, { name: string; decimals: number; emoji: string }> = {
  ETH:  { name: "ETH",  decimals: 18, emoji: "⟠" },
  WETH: { name: "WETH", decimals: 18, emoji: "⟠" },
  USDC: { name: "USDC", decimals: 6,  emoji: "$" },
};

interface TokenSelectorProps {
  value: TokenSymbol;
  onChange: (token: TokenSymbol) => void;
  label?: string;
  disabled?: boolean;
}

export default function TokenSelector({
  value,
  onChange,
  label = "Pay with",
  disabled = false,
}: TokenSelectorProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-slate-300">{label}</label>}
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(TOKEN_META) as TokenSymbol[]).map((sym) => {
          const meta = TOKEN_META[sym];
          const selected = value === sym;
          return (
            <button
              key={sym}
              type="button"
              disabled={disabled}
              onClick={() => onChange(sym)}
              aria-pressed={selected}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm font-semibold min-h-[64px] transition-all duration-150 ${
                selected
                  ? "border-brand-500 bg-brand-500/10 text-brand-300"
                  : "border-surface-border text-slate-400 hover:text-white hover:border-slate-500"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="text-xl">{meta.emoji}</span>
              <span>{meta.name}</span>
            </button>
          );
        })}
      </div>
      {value !== "ETH" && (
        <p className="text-xs text-slate-600 font-mono">{BASE_SEPOLIA_TOKENS[value]}</p>
      )}
    </div>
  );
}
