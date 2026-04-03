import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, decodeEventLog } from 'viem'
import { MANAGER_ABI, ESCROW_MANAGER_ADDRESS } from '@/lib/constants'

export function useCreateDeal() {
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  function create(amount: string, _description: string, timeoutHours: number) {
    writeContract({
      address: ESCROW_MANAGER_ADDRESS,
      abi: MANAGER_ABI,
      functionName: 'createDeal',
      args: [BigInt(timeoutHours * 3600)],
      value: parseEther(amount),
    })
  }

  // Parse dealId from DealCreated event log
  let newDealId: bigint | undefined
  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: MANAGER_ABI, ...log })
        if (decoded.eventName === 'DealCreated') {
          newDealId = (decoded.args as { dealId: bigint }).dealId
          break
        }
      } catch { /* skip unrelated logs */ }
    }
  }

  return { create, isPending, isConfirming, isSuccess, isError, error, newDealId }
}

export function useDepositFunds(dealId: bigint) {
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function deposit(amount: string, codeHash: `0x${string}`) {
    writeContract({
      address: ESCROW_MANAGER_ADDRESS,
      abi: MANAGER_ABI,
      functionName: 'depositFunds',
      args: [dealId, codeHash],
      value: parseEther(amount),
    })
  }

  return { deposit, isPending, isConfirming, isSuccess, isError, error }
}

export function useReleaseEscrow(dealId: bigint) {
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function release(code: string) {
    writeContract({
      address: ESCROW_MANAGER_ADDRESS,
      abi: MANAGER_ABI,
      functionName: 'releaseToSeller',
      args: [dealId, code],
    })
  }

  return { release, isPending, isConfirming, isSuccess, isError, error }
}

export function useClaimRefund(dealId: bigint) {
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function claimRefund() {
    writeContract({
      address: ESCROW_MANAGER_ADDRESS,
      abi: MANAGER_ABI,
      functionName: 'claimRefund',
      args: [dealId],
    })
  }

  return { claimRefund, isPending, isConfirming, isSuccess, isError, error }
}
