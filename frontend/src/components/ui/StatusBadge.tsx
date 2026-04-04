import { EscrowStatus } from '@/lib/types'

const config: Record<EscrowStatus, { label: string; dot: string; pill: string }> = {
  [EscrowStatus.CREATED]: {
    label: 'Awaiting payment',
    dot:  'bg-hoff-text-tertiary',
    pill: 'bg-hoff-elevated text-hoff-text-tertiary',
  },
  [EscrowStatus.FUNDED]: {
    label: 'Funded · Meet up',
    dot:  'bg-amber-400',
    pill: 'bg-amber-900/30 text-amber-300',
  },
  [EscrowStatus.COMPLETED]: {
    label: 'Completed · Claim',
    dot:  'bg-hoff-accent',
    pill: 'bg-hoff-accent-muted text-hoff-accent',
  },
  [EscrowStatus.EXPIRED]: {
    label: 'Refunded',
    dot:  'bg-hoff-text-tertiary',
    pill: 'bg-hoff-elevated text-hoff-text-tertiary',
  },
  [EscrowStatus.CANCELED]: {
    label: 'Canceled',
    dot:  'bg-red-400',
    pill: 'bg-red-900/30 text-red-400',
  },
}

export function StatusBadge({ status }: { status: EscrowStatus }) {
  const { label, dot, pill } = config[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  )
}
