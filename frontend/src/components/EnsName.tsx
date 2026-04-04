import { useEnsName } from 'wagmi'
import { mainnet } from 'wagmi/chains'

interface EnsNameProps {
  address: `0x${string}`
  className?: string
}

export function EnsName({ address, className = '' }: EnsNameProps) {
  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
  })

  const display = ensName ?? `${address.slice(0, 6)}...${address.slice(-4)}`

  return <span className={className}>{display}</span>
}
