import { useAccount } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'

export function WrongNetworkBanner() {
  const { isConnected, chainId } = useAccount()
  const { setShowDynamicUserProfile } = useDynamicContext()

  if (!isConnected || chainId === baseSepolia.id) return null

  return (
    <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-red-950/60 border-b border-red-900/50">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 animate-pulse" />
        <p className="text-xs text-red-300 truncate">
          Wrong network — connect to Base Sepolia to use Hand-Off
        </p>
      </div>
      <button
        onClick={() => setShowDynamicUserProfile(true)}
        className="shrink-0 text-xs font-medium text-red-300 hover:text-white
          border border-red-800 hover:border-red-500 px-3 py-1 rounded-lg
          transition-colors"
      >
        Switch
      </button>
    </div>
  )
}
