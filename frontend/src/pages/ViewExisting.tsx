import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'

function isValidDealId(param: string | undefined): param is string {
  if (!param) return false
  const n = Number(param)
  return Number.isInteger(n) && n > 0
}

const STEPS = [
  {
    n: 1,
    title: 'Deposit Funds',
    body: 'Deposit the agreed upon amount in our secure escrow and receive an unlock code.',
  },
  {
    n: 2,
    title: 'Meet Up',
    body: 'Meet the seller, inspect the goods, and provide the seller with your code to unlock payment.',
  },
  {
    n: 3,
    title: 'Release & Review',
    body: 'Funds are released to the seller or returned to you. Optionally, leave a review later.',
  },
]

export default function ViewExisting() {
  const { dealId } = useParams<{ dealId: string }>()
  const navigate = useNavigate()
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer')

  if (!isValidDealId(dealId)) {
    return (
      <Layout>
        <main className="max-w-sm mx-auto px-4 py-6">
          <div className="bg-hoff-surface rounded-2xl p-5">
            <p className="text-sm text-red-400">Invalid deal link. Check the URL and try again.</p>
          </div>
        </main>
      </Layout>
    )
  }

  function handleContinue() {
    if (role === 'buyer') {
      navigate(`/pay/${dealId}`)
    } else {
      navigate(`/deal/${dealId}`)
    }
  }

  return (
    <Layout>
      <main className="max-w-sm mx-auto px-4 py-6 space-y-6">

        {/* Checkmark + headline */}
        <div className="flex flex-col items-center gap-4 pt-2 text-center">
          <div className="w-16 h-16 rounded-full bg-hoff-accent/20 border-2 border-hoff-accent flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2EBF7A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-hoff-text-primary leading-tight">
              Safe transactions,<br />in Person
            </h1>
            <p className="text-sm text-hoff-text-tertiary max-w-xs mx-auto">
              Deposit Crypto, Get a Code, Release Funds by confirming the handoff
            </p>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {STEPS.map(({ n, title, body }) => (
            <div key={n} className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-hoff-accent/20 border border-hoff-accent/40 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-hoff-accent">{n}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-hoff-text-primary mb-0.5">{title}</p>
                <p className="text-xs text-hoff-text-tertiary leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Role toggle */}
        <div className="bg-hoff-surface rounded-2xl p-1 flex gap-1">
          <button
            onClick={() => setRole('buyer')}
            className={`flex-1 h-9 rounded-xl text-xs font-semibold transition-colors ${
              role === 'buyer'
                ? 'bg-hoff-accent text-hoff-bg'
                : 'text-hoff-text-tertiary hover:text-hoff-text-secondary'
            }`}
          >
            I'm Buying
          </button>
          <button
            onClick={() => setRole('seller')}
            className={`flex-1 h-9 rounded-xl text-xs font-semibold transition-colors ${
              role === 'seller'
                ? 'bg-hoff-accent text-hoff-bg'
                : 'text-hoff-text-tertiary hover:text-hoff-text-secondary'
            }`}
          >
            I'm Selling
          </button>
        </div>

        {/* CTA */}
        <button
          onClick={handleContinue}
          className="w-full h-12 rounded-xl bg-hoff-accent text-hoff-bg font-bold text-sm hover:bg-hoff-accent-hover transition-colors"
        >
          Continue
        </button>

      </main>
    </Layout>
  )
}
