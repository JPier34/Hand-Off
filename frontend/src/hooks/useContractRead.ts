import { useQuery } from '@tanstack/react-query'
import { publicClient } from '@/lib/publicClient'
import type { Abi, Address } from 'viem'

interface UseContractReadParams {
  address: Address | undefined
  abi: Abi
  functionName: string
  args?: unknown[]
  query?: {
    enabled?: boolean
    refetchInterval?: number
  }
}

/**
 * Drop-in replacement for wagmi's useReadContract.
 * Uses viem's publicClient directly + @tanstack/react-query for caching.
 */
export function useContractRead({ address, abi, functionName, args, query }: UseContractReadParams) {
  const enabled = (query?.enabled ?? true) && !!address

  return useQuery({
    queryKey: ['contractRead', address, functionName, ...(args ?? [])],
    queryFn: async () => {
      if (!address) throw new Error('No address')
      return publicClient.readContract({
        address,
        abi,
        functionName,
        args: args as readonly unknown[],
      })
    },
    enabled,
    refetchInterval: query?.refetchInterval,
  })
}
