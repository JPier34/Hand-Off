import { useState } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useDeployContract, useAccount } from 'wagmi'
import { parseEther, parseUnits } from 'viem'
import { HANDOFF_ABI, REPUTATION_ABI, REPUTATION_ADDRESS, SUBNAME_ADDRESS, UNIVERSAL_ROUTER_ADDRESS } from '@/lib/constants'
import { MOCK_MODE, MOCK_DEAL_ID, mockDeposit, mockRelease, mockRefund, mockCancel, mockEditDeal } from '@/lib/mock'
import { hashUnlockCode } from '@/lib/code-gen'
import { HANDOFF_BYTECODE } from '@/contracts/HandOff.bytecode'
import { TOKENS } from '@/lib/tokens'
import type { Address } from '@/lib/types'

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
  const { address: sellerAddress } = useAccount()

  // Step 1: Deploy HandOff.sol
  const deploy = useDeployContract()
  const deployReceipt = useWaitForTransactionReceipt({ hash: deploy.data })

  // Step 2: Register with Reputation registry → get dealId
  const register = useWriteContract()
  const registerReceipt = useWaitForTransactionReceipt({ hash: register.data })

  // Track which step we're on
  const [step, setStep] = useState<'idle' | 'deploying' | 'registering' | 'done'>('idle')
  const [escrowAddress, setEscrowAddress] = useState<Address | undefined>()
  const [dealId, setDealId] = useState<bigint | undefined>()

  // When deploy succeeds → call registerHandOff
  if (deployReceipt.isSuccess && deployReceipt.data?.contractAddress && step === 'deploying') {
    const addr = deployReceipt.data.contractAddress as Address
    setEscrowAddress(addr)
    setStep('registering')
    register.writeContract({
      address: REPUTATION_ADDRESS,
      abi: REPUTATION_ABI,
      functionName: 'registerHandOff',
      args: [addr],
    })
  }

  // When registration succeeds → parse dealId from return value / logs
  if (registerReceipt.isSuccess && step === 'registering') {
    setStep('done')
    // registerHandOff emits HandOffRegistered(escrow, dealId)
    // Parse dealId from the first log's last topic
    try {
      const log = registerReceipt.data?.logs?.[0]
      if (log && log.topics[2]) {
        setDealId(BigInt(log.topics[2]))
      }
    } catch { /* fallback: use escrow address */ }
  }

  function create(amount: string, _description: string, timeoutHours: number, payoutTokenKey = 'ETH') {
    if (!sellerAddress) return

    const token = TOKENS[payoutTokenKey]
    const payoutToken: Address = token?.address ?? '0x0000000000000000000000000000000000000000'
    const parsedAmount = token?.address
      ? parseUnits(amount, token.decimals)
      : parseEther(amount)
    const expirationWindow = BigInt(timeoutHours * 3600)

    setStep('deploying')
    setEscrowAddress(undefined)
    setDealId(undefined)

    deploy.deployContract({
      abi: HANDOFF_ABI,
      bytecode: HANDOFF_BYTECODE,
      args: [
        sellerAddress,              // _seller
        payoutToken,                // _payoutToken (address(0) = ETH)
        parsedAmount,               // _amount
        expirationWindow,           // _expirationWindow (seconds)
        0n,                         // _dealId (assigned by registry)
        REPUTATION_ADDRESS,         // _reputationRegistry
        SUBNAME_ADDRESS,            // _subnameRegistrar
        '',                         // _sellerEns
        UNIVERSAL_ROUTER_ADDRESS,   // _allowedRouter
      ],
    })
  }

  const isPending    = deploy.isPending || register.isPending
  const isConfirming = deployReceipt.isLoading || registerReceipt.isLoading
  const isSuccess    = step === 'done' || (deployReceipt.isSuccess && registerReceipt.isSuccess)
  const isError      = deploy.isError || register.isError
  const error        = deploy.error || register.error

  // Use dealId for URL if available, otherwise fall back to escrow address
  const newDealId = dealId
  const newEscrowAddress = escrowAddress

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
  function create(_amount: string, _description: string, _timeoutHours: number, _payoutTokenKey?: string) { trigger() }
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
