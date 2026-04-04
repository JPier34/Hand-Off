import { useState } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, parseEventLogs } from 'viem'
import { HANDOFF_ABI, REPUTATION_ABI, REPUTATION_ADDRESS, SUBNAME_ADDRESS, FACTORY_ABI, FACTORY_ADDRESS } from '@/lib/constants'
import { MOCK_MODE, MOCK_DEAL_ID, mockDeposit, mockRelease, mockRefund, mockCancel, mockEditDeal } from '@/lib/mock'
import { hashUnlockCode } from '@/lib/code-gen'
import { TOKENS } from '@/lib/tokens'
import type { Address } from '@/lib/types'
import type { Abi } from 'viem'

// ─── Mock TX state helpers ─────────────────────────────────────────────────────

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

// ─── Real hooks (per-deal contract calls) ─────────────────────────────────────

function useRealCreateDeal() {
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  // FACTORY WIRING (UC-1): call HandOffFactory.createHandOff() instead of deploying directly.
  // The factory atomically deploys a new HandOff escrow + registers it with HandOffReputation.
  function create(
    amount: string,
    _description: string,   // description is frontend-only; not stored on-chain
    timeoutHours: number,
    payoutTokenKey = 'ETH',
    sellerEns = '',
  ) {
    const token = TOKENS[payoutTokenKey]
    const payoutToken: Address = (token?.address ?? '0x0000000000000000000000000000000000000000') as Address
    const expirationWindow = BigInt(timeoutHours * 3600)

    writeContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'createHandOff',
      args: [payoutToken, parseEther(amount), expirationWindow, sellerEns],
    })
  }

  // Parse HandOffCreated(seller, escrow, dealId) from the factory receipt.
  // All three params are indexed → each lives in topics[1..3]; data is empty.
  let newDealId: bigint | undefined
  let newEscrowAddress: Address | undefined
  if (receipt) {
    try {
      const logs = parseEventLogs({
        abi: FACTORY_ABI as Abi,
        logs: receipt.logs,
        eventName: 'HandOffCreated',
      })
      if (logs.length > 0) {
        const args = logs[0].args as { seller: Address; escrow: Address; dealId: bigint }
        newDealId = args.dealId
        newEscrowAddress = args.escrow
      }
    } catch { /* logs from other contracts — safe to ignore */ }
  }

  return { create, isPending, isConfirming, isSuccess, isError, error, newDealId, newEscrowAddress }
}

// Fund: call fund(codeHash, buyerEns) on the escrow contract directly
function useRealDepositFunds(dealId: bigint, escrowAddress?: Address) {
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function deposit(amount: string, codeHash: `0x${string}`, buyerEns = '') {
    if (!escrowAddress) return
    writeContract({
      address: escrowAddress,
      abi: HANDOFF_ABI,
      functionName: 'fund',
      args: [codeHash, buyerEns],
      value: parseEther(amount),
    })
  }

  return { deposit, isPending, isConfirming, isSuccess, isError, error }
}

// Unlock: call unlock(submittedHash) — takes bytes32 hash, NOT plaintext
function useRealReleaseEscrow(dealId: bigint, escrowAddress?: Address) {
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function release(code: string) {
    if (!escrowAddress) return
    const codeHash = hashUnlockCode(code)
    writeContract({
      address: escrowAddress,
      abi: HANDOFF_ABI,
      functionName: 'unlock',
      args: [codeHash],
    })
  }

  return { release, isPending, isConfirming, isSuccess, isError, error }
}

// Refund: call refund() on escrow — no args
function useRealClaimRefund(dealId: bigint, escrowAddress?: Address) {
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function claimRefund() {
    if (!escrowAddress) return
    writeContract({
      address: escrowAddress,
      abi: HANDOFF_ABI,
      functionName: 'refund',
    })
  }

  return { claimRefund, isPending, isConfirming, isSuccess, isError, error }
}

// Cancel: call cancel() on escrow — no args
function useRealCancelDeal(dealId: bigint, escrowAddress?: Address) {
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function cancel() {
    if (!escrowAddress) return
    writeContract({
      address: escrowAddress,
      abi: HANDOFF_ABI,
      functionName: 'cancel',
    })
  }

  return { cancel, isPending, isConfirming, isSuccess, isError, error }
}

// Edit: call edit(newAmount, newPayoutToken, newSellerPayoutAddress, newExpirationTimestamp)
// Contract rejects zero values — caller must pass real current values for unchanged fields
function useRealEditDeal(dealId: bigint, escrowAddress?: Address) {
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function edit(
    amount: bigint,
    _description: string,
    payoutToken: Address = '0x0000000000000000000000000000000000000000',
    sellerPayoutAddress: Address = '0x0000000000000000000000000000000000000000',
    expirationTimestamp: bigint = 0n,
  ) {
    if (!escrowAddress) return
    writeContract({
      address: escrowAddress,
      abi: HANDOFF_ABI,
      functionName: 'edit',
      args: [amount, payoutToken, sellerPayoutAddress, expirationTimestamp],
    })
  }

  return { edit, isPending, isConfirming, isSuccess, isError, error }
}

// SubmitReview: call submitReview(isPositive) on escrow
function useRealSubmitReview(escrowAddress?: Address) {
  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function submitReview(isPositive: boolean) {
    if (!escrowAddress) return
    writeContract({
      address: escrowAddress,
      abi: HANDOFF_ABI,
      functionName: 'submitReview',
      args: [isPositive],
    })
  }

  return { submitReview, isPending, isConfirming, isSuccess, isError, error }
}

// ─── Mock hooks ────────────────────────────────────────────────────────────────

function useMockCreateDeal() {
  const { trigger, ...state } = useMockTx(() => {})
  function create(_amount: string, _description: string, _timeoutHours: number, _payoutTokenKey?: string, _sellerEns?: string) { trigger() }
  const newDealId = state.isSuccess ? MOCK_DEAL_ID : undefined
  const newEscrowAddress: Address | undefined = state.isSuccess
    ? `0x${MOCK_DEAL_ID.toString(16).padStart(40, '0')}` as Address
    : undefined
  return { create, ...state, newDealId, newEscrowAddress }
}

function useMockDepositFunds(dealId: bigint) {
  const { trigger, ...state } = useMockTx(() => mockDeposit(dealId))
  function deposit(_amount: string, _codeHash: `0x${string}`, _buyerEns = '') { trigger() }
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

  function edit(amount: bigint, description: string, _payoutToken?: Address, _sellerPayoutAddress?: Address, _expirationTimestamp?: bigint) {
    setEditAmount(amount)
    setEditDesc(description)
    trigger()
  }

  if (state.isSuccess && editAmount !== null && editDesc !== null) {
    mockEditDeal(dealId, editAmount, editDesc)
  }

  return { edit, ...state }
}

function useMockSubmitReview() {
  const { trigger, ...state } = useMockTx(() => {})
  function submitReview(_isPositive: boolean) { trigger() }
  return { submitReview, ...state }
}

// ─── Public exports ─────────────────────────────────────────────────────────────

export function useCreateDeal() {
  const real = useRealCreateDeal()
  const mock = useMockCreateDeal()
  return MOCK_MODE ? mock : real
}

export function useDepositFunds(dealId: bigint, escrowAddress?: Address) {
  const real = useRealDepositFunds(dealId, escrowAddress)
  const mock = useMockDepositFunds(dealId)
  return MOCK_MODE ? mock : real
}

export function useReleaseEscrow(dealId: bigint, escrowAddress?: Address) {
  const real = useRealReleaseEscrow(dealId, escrowAddress)
  const mock = useMockReleaseEscrow(dealId)
  return MOCK_MODE ? mock : real
}

export function useClaimRefund(dealId: bigint, escrowAddress?: Address) {
  const real = useRealClaimRefund(dealId, escrowAddress)
  const mock = useMockClaimRefund(dealId)
  return MOCK_MODE ? mock : real
}

export function useCancelDeal(dealId: bigint, escrowAddress?: Address) {
  const real = useRealCancelDeal(dealId, escrowAddress)
  const mock = useMockCancelDeal(dealId)
  return MOCK_MODE ? mock : real
}

export function useEditDeal(dealId: bigint, escrowAddress?: Address) {
  const real = useRealEditDeal(dealId, escrowAddress)
  const mock = useMockEditDeal(dealId)
  return MOCK_MODE ? mock : real
}

export function useSubmitReview(escrowAddress?: Address) {
  const real = useRealSubmitReview(escrowAddress)
  const mock = useMockSubmitReview()
  return MOCK_MODE ? mock : real
}
