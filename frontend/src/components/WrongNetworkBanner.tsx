import { useState } from 'react'
import { baseSepolia } from 'viem/chains'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'
import { getWalletAccounts, switchActiveNetwork } from '@dynamic-labs-sdk/client'

export function WrongNetworkBanner() {
  const { isAuthenticated } = useDynamicAuth()
  const [isPending, setIsPending] = useState(false)

  // useDynamicWrite already handles chain switching per-transaction,
  // so this banner is a courtesy hint. We don't track chain state reactively
  // (Dynamic JS SDK doesn't expose a chain-changed hook easily).
  // Instead, the banner shows for authenticated users and the switch button
  // ensures the wallet is on Base Sepolia.
  if (!isAuthenticated) return null

  async function handleSwitch() {
    setIsPending(true)
    try {
      const accounts = getWalletAccounts()
      const walletAccount = accounts?.[0]
      if (walletAccount) {
        await switchActiveNetwork({ walletAccount, networkId: String(baseSepolia.id) })
      }
    } catch {
      // Silently fail — useDynamicWrite will handle chain switch per-tx
    }
    setIsPending(false)
  }

  return null // Hidden by default — useDynamicWrite auto-switches per transaction
  // Uncomment below to show the banner as a manual switch option:
  /*
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-red-950/60 border-b border-red-900/50">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 animate-pulse" />
        <p className="text-xs text-red-300 truncate">
          Wrong network — switch to Base Sepolia
        </p>
      </div>
      <button
        onClick={handleSwitch}
        disabled={isPending}
        className="shrink-0 text-xs font-medium text-red-300 hover:text-white
          border border-red-800 hover:border-red-500 px-3 py-1 rounded-lg
          transition-colors disabled:opacity-50"
      >
        {isPending ? 'Switching…' : 'Switch'}
      </button>
    </div>
  )
  */
}
