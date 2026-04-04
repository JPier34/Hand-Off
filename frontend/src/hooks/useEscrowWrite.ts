import { useState } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, decodeEventLog } from 'viem'
import { MANAGER_ABI, ESCROW_MANAGER_ADDRESS } from '@/lib/constants'
import { MOCK_MODE, MOCK_DEAL_ID, mockDeposit, mockRelease, mockRefund, mockCancel, mockEditDeal } from '@/lib/mock'

// ─── Mock TX state helpers ─────────────────────────────────────────────────────
// Simulates: idle → isPending (1s) → isConfirming (1.5s) → isSuccess

interface MockTxState {
  isPending:    boolean
  isConfirming: boolean
  isSuccess:    boolean
  isError:      boolean
  error:        Error | null
}

const IDLE: MockTxState = {
  isPending: false, isConfirming: false, isSuccess: false, isError: false, error: null,
}

function useMockTx(onConfirmed: () => void) {
  const [state, setState] = useState<MockTxState>(IDLE)

  function trigger() {
    setState({ ...IDLE, isPending: true })
    setTimeout(() => {
      setState({ ...IDLE, isConfirming: true })
      setTimeout(() => {
        onConfirmed()
        setState({ ...IDLE, isSuccess: true })
      }, 1500)
    }, 1000)
  }

  return { ...state, trigger }
}

// ─── Real hooks ────────────────────────────────────────────────────────────────

function useRealCreateDeal() {
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

function useRealDepositFunds(dealId: bigint) {
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

function useRealReleaseEscrow(dealId: bigint) {
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

function useRealClaimRefund(dealId: bigint) {
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

// ─── Mock hooks ────────────────────────────────────────────────────────────────

function useMockCreateDeal() {
  // Create does not change escrow state — deal stays PENDING until buyer funds
  const { trigger, ...state } = useMockTx(() => {})

  function create(_amount: string, _description: string, _timeoutHours: number) {
    trigger()
  }

  return { create, ...state, newDealId: state.isSuccess ? MOCK_DEAL_ID : undefined }
}

function useMockDepositFunds(dealId: bigint) {
  const { trigger, ...state } = useMockTx(() => mockDeposit(dealId))

  function deposit(_amount: string, _codeHash: `0x${string}`) { trigger() }

  return { deposit, ...state }
}

function useMockReleaseEscrow(dealId: bigint) {
  const { trigger, ...state } = useMockTx(() => mockRelease(dealId))

  function release(_code: string) { trigger() }

  return { release, ...state }
}

function useMockClaimRefund(dealId: bigint) {
  const { trigger, ...state } = useMockTx(() => mockRefund(dealId))

  function claimRefund() { trigger() }

  return { claimRefund, ...state }
}

function useMockCancelDeal(dealId: bigint) {
  const { trigger, ...state } = useMockTx(() => mockCancel(dealId))

  function cancel() { trigger() }

  return { cancel, ...state }
}

function useMockEditDeal(dealId: bigint) {
  const { trigger, ...state } = useMockTx(() => {})
  const [editAmount, setEditAmount] = useState<bigint | null>(null)
  const [editDesc, setEditDesc] = useState<string | null>(null)

  function edit(amount: bigint, description: string) {
    setEditAmount(amount)
    setEditDesc(description)
    trigger()
  }

  // Apply the edit after mock TX succeeds
  if (state.isSuccess && editAmount !== null && editDesc !== null) {
    mockEditDeal(dealId, editAmount, editDesc)
  }

  return { edit, ...state }
}

// ─── Real stubs (cancel / edit — needs contract) ──────────────────────────────

function useRealCancelDeal(_dealId: bigint) {
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function cancel() {
    writeContract({
      address: ESCROW_MANAGER_ADDRESS,
      abi: MANAGER_ABI,
      functionName: 'cancelDeal',
      args: [_dealId],
    })
  }

  return { cancel, isPending, isConfirming, isSuccess, isError, error }
}

function useRealEditDeal(_dealId: bigint) {
  const [state] = useState({ isPending: false, isConfirming: false, isSuccess: false, isError: false, error: null as Error | null })
  function edit(_amount: bigint, _description: string) { /* needs contract */ }
  return { edit, ...state }
}

// ─── Public exports ─────────────────────────────────────────────────────────────
// Both real and mock hooks are always called; we pick the right result.

export function useCreateDeal() {
  const real = useRealCreateDeal()
  const mock = useMockCreateDeal()
  return MOCK_MODE ? mock : real
}

export function useDepositFunds(dealId: bigint) {
  const real = useRealDepositFunds(dealId)
  const mock = useMockDepositFunds(dealId)
  return MOCK_MODE ? mock : real
}

export function useReleaseEscrow(dealId: bigint) {
  const real = useRealReleaseEscrow(dealId)
  const mock = useMockReleaseEscrow(dealId)
  return MOCK_MODE ? mock : real
}

export function useClaimRefund(dealId: bigint) {
  const real = useRealClaimRefund(dealId)
  const mock = useMockClaimRefund(dealId)
  return MOCK_MODE ? mock : real
}

export function useCancelDeal(dealId: bigint) {
  const real = useRealCancelDeal(dealId)
  const mock = useMockCancelDeal(dealId)
  return MOCK_MODE ? mock : real
}

export function useEditDeal(dealId: bigint) {
  const real = useRealEditDeal(dealId)
  const mock = useMockEditDeal(dealId)
  return MOCK_MODE ? mock : real
}
