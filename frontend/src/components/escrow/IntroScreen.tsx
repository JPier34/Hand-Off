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

interface IntroScreenProps {
  onContinue: () => void
}

export function IntroScreen({ onContinue }: IntroScreenProps) {
  return (
    <main className="w-full px-4 sm:max-w-md sm:mx-auto py-6 space-y-6">

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

      {/* CTA */}
      <button
        onClick={onContinue}
        className="w-full h-12 rounded-xl bg-hoff-accent text-hoff-bg font-bold text-sm hover:bg-hoff-accent-hover transition-colors"
      >
        Continue
      </button>

    </main>
  )
}
