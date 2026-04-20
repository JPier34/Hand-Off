import { useAccount, useSwitchChain } from 'wagmi'
import { sepolia, mainnet } from 'wagmi/chains'
import { getTargetChainId, CHAIN_IDS } from '@/lib/chains'

const TARGET_CHAIN = getTargetChainId() === CHAIN_IDS.MAINNET ? mainnet : sepolia
const NETWORK_NAME = getTargetChainId() === CHAIN_IDS.MAINNET ? 'Ethereum Mainnet' : 'Ethereum Sepolia'

export function WrongNetworkBanner() {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === TARGET_CHAIN.id) return null

  return (
    <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-hoff-err-bg border-b border-hoff-err/30">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-hoff-err shrink-0 animate-pulse" />
        <p className="text-xs text-hoff-err truncate">
          Wrong network — switch to {NETWORK_NAME}
        </p>
      </div>
      <button
        onClick={() => switchChain({ chainId: TARGET_CHAIN.id })}
        disabled={isPending}
        className="shrink-0 text-xs font-medium text-hoff-err hover:text-hoff-text-primary
          border border-hoff-err/40 hover:border-hoff-err px-3 py-1 rounded-lg
          transition-colors disabled:opacity-50"
      >
        {isPending ? 'Switching…' : 'Switch'}
      </button>
    </div>
  )
}
