import { computeDealSubname, dealSubnameUrl } from '@/lib/ens'

interface DealReceiptBadgeProps {
  /** The raw URL param — either a numeric deal ID string or a 0x address. */
  dealIdParam: string
}

/**
 * Shows a `deal-{id}.hand-off.eth` ENS receipt badge.
 * Only renders when `dealIdParam` is a numeric deal ID (not a raw address).
 */
export function DealReceiptBadge({ dealIdParam }: DealReceiptBadgeProps) {
  const dealId = /^\d+$/.test(dealIdParam) ? BigInt(dealIdParam) : null
  if (dealId === null) return null

  const subname = computeDealSubname(dealId)
  const href    = dealSubnameUrl(dealId)

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 bg-hoff-surface rounded-2xl px-5 py-3 hover:bg-hoff-elevated transition-colors group"
    >
      {/* ENS logo pill */}
      <div className="w-8 h-8 rounded-full bg-hoff-accent/15 border border-hoff-accent/30 flex items-center justify-center shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#2EBF7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-hoff-text-tertiary uppercase tracking-widest mb-0.5">
          ENS Receipt
        </p>
        <p className="text-sm font-mono text-hoff-text-primary truncate group-hover:text-hoff-accent transition-colors">
          {subname}
        </p>
      </div>

      {/* External link icon */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-hoff-text-tertiary shrink-0 group-hover:text-hoff-accent transition-colors">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    </a>
  )
}
