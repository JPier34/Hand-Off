import { useState, useEffect, useRef } from "react";
import type { Address } from "viem";
import { resolveEns } from "../lib/ens";

// ---------------------------------------------------------------------------
// UC-15: Live ENS resolution input
// - Debounced 500ms after user types a .eth name
// - Shows resolved address for confirmation
// - onResolve(null) signals failed resolution — callers MUST block submission
// ---------------------------------------------------------------------------

interface EnsInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  /** Called with resolved address or null if resolution fails */
  onResolve?: (address: Address | null) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
}

export default function EnsInput({
  label,
  placeholder = "alice.eth or 0x…",
  value,
  onChange,
  onResolve,
  disabled = false,
  required = false,
  className = "",
  id,
}: EnsInputProps) {
  const [resolved, setResolved] = useState<Address | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionFailed, setResolutionFailed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setResolved(null);
    setResolutionFailed(false);

    // Only resolve .eth names; raw 0x addresses pass through
    if (!value.trim() || !value.includes(".")) {
      setIsResolving(false);
      return;
    }

    setIsResolving(true);
    debounceRef.current = setTimeout(async () => {
      const address = await resolveEns(value);
      setIsResolving(false);
      if (address) {
        setResolved(address);
        setResolutionFailed(false);
        onResolve?.(address);
      } else {
        setResolutionFailed(true);
        onResolve?.(null);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const showError = resolutionFailed && !isResolving;
  const showSuccess = !!resolved && !isResolving;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-slate-300">
          {label}
          {required && <span className="text-danger ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={showError}
          aria-describedby={id ? `${id}-hint` : undefined}
          className={`input pr-10 ${showError ? "border-danger focus:border-danger focus:ring-danger" : ""}`}
        />

        {/* Status icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {isResolving && (
            <svg className="animate-spin h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {showSuccess && (
            <svg className="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {showError && (
            <svg className="h-4 w-4 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
      </div>

      {/* Resolved address preview */}
      {showSuccess && resolved && (
        <p id={id ? `${id}-hint` : undefined} className="text-xs text-success font-mono">
          ✓ {resolved.slice(0, 10)}…{resolved.slice(-6)}
        </p>
      )}

      {/* UC-15: Block submission message when forward resolution fails */}
      {showError && (
        <p id={id ? `${id}-hint` : undefined} className="text-xs text-danger">
          This name doesn&apos;t resolve to an address — check the spelling.
        </p>
      )}
    </div>
  );
}
