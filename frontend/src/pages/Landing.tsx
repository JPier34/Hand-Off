import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Layout } from '@/components/Layout'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Spinner } from '@/components/ui/Spinner'
import { CodeDisplay } from '@/components/escrow/CodeDisplay'
import { CountdownTimer } from '@/components/escrow/CountdownTimer'
import { EscrowStatus } from '@/lib/types'

// Dev scaffold — shows all available components.
// Replace with real Home/Landing page at the hackathon.

export default function Landing() {
  const { address, isConnected } = useAccount()
  const [demoExpiresAt] = useState(() => Date.now() + 3_600_000 * 23)

  return (
    <Layout>
      <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6 space-y-4">

        <Card>
          <p className="text-xs text-hoff-text-tertiary mb-1">Wallet</p>
          <p className="text-sm text-hoff-text-primary">
            {isConnected ? address : 'Not connected'}
          </p>
        </Card>

        <Card className="space-y-2">
          <p className="text-xs text-hoff-text-tertiary mb-2">StatusBadge</p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={EscrowStatus.CREATED} />
            <StatusBadge status={EscrowStatus.FUNDED} />
            <StatusBadge status={EscrowStatus.COMPLETED} />
            <StatusBadge status={EscrowStatus.EXPIRED} />
          </div>
        </Card>

        <Card className="space-y-2">
          <p className="text-xs text-hoff-text-tertiary mb-2">Button</p>
          <div className="flex gap-2 flex-wrap">
            <Button>Primary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Card>

        <Card>
          <p className="text-xs text-hoff-text-tertiary mb-3">CodeDisplay</p>
          <CodeDisplay code="4729" />
        </Card>

        <Card>
          <p className="text-xs text-hoff-text-tertiary mb-2">CountdownTimer</p>
          <CountdownTimer expiresAt={demoExpiresAt} />
        </Card>

        <Card className="flex items-center gap-4">
          <p className="text-xs text-hoff-text-tertiary">Spinner</p>
          <Spinner size="sm" />
          <Spinner size="md" />
        </Card>

        <Card className="space-y-2">
          <p className="text-xs text-hoff-text-tertiary mb-2">Transaction states</p>
          <div className="flex items-center gap-2 text-hoff-warn bg-hoff-warn-bg px-4 py-3 rounded-lg border border-hoff-warn/20">
            <Spinner size="sm" />
            <span className="text-sm">Confirm in your wallet app</span>
          </div>
          <div className="flex items-center gap-2 text-hoff-accent bg-hoff-accent-muted px-4 py-3 rounded-lg">
            <Spinner size="sm" />
            <span className="text-sm">Transaction processing on-chain...</span>
          </div>
          <div className="text-hoff-accent bg-hoff-accent-muted px-4 py-3 rounded-lg text-sm">✓ Done</div>
          <div className="text-hoff-err bg-hoff-err-bg px-4 py-3 rounded-lg text-sm border border-hoff-err/20">
            Transaction failed
          </div>
        </Card>

        <Card className="space-y-1">
          <p className="text-xs text-hoff-text-tertiary mb-2">Routes</p>
          <p className="text-xs font-mono text-hoff-text-tertiary">/              → Home (seller CTA)</p>
          <p className="text-xs font-mono text-hoff-text-tertiary">/create        → CreateDeal (seller)</p>
          <p className="text-xs font-mono text-hoff-text-tertiary">/pay/:dealId   → BuyerPay (buyer, via link)</p>
          <p className="text-xs font-mono text-hoff-text-tertiary">/deal/:dealId  → ManageDeal (seller)</p>
          <p className="text-xs font-mono text-hoff-text-tertiary">/history       → History</p>
        </Card>

      </main>
    </Layout>
  )
}
