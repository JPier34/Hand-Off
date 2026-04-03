export function CodeDisplay({ code }: { code: string }) {
  return (
    <div className="text-center py-6">
      <p className="text-sm text-hoff-text-tertiary mb-3">Show this code to the seller</p>
      <div className="flex justify-center gap-3">
        {code.split('').map((digit, i) => (
          <div
            key={i}
            className="w-14 h-16 bg-hoff-bg border border-hoff-accent/30 text-hoff-accent text-3xl font-mono flex items-center justify-center rounded-lg"
          >
            {digit}
          </div>
        ))}
      </div>
      <p className="text-xs text-hoff-text-tertiary mt-3">Only share this in person at the handoff</p>
    </div>
  )
}
