import { useState, useEffect, useRef } from 'react'
import { parseEther, parseUnits, parseEventLogs, createWalletClient, custom } from 'viem'
import { sepolia } from 'viem/chains'
import { HANDOFF_ABI, FACTORY_ABI, FACTORY_ADDRESS, SUBNAME_ABI, SUBNAME_ADDRESS } from '@/lib/constants'
import { MOCK_MODE, MOCK_DEAL_ID, mockDeposit, mockRelease, mockRefund, mockCancel, mockEditDeal } from '@/lib/mock'
import { hashUnlockCode } from '@/lib/code-gen'
import { useDynamicWriteContract } from '@/hooks/useDynamicWrite'
import { useReceiptPoller } from '@/hooks/useReceiptPoller'
import { TOKENS, getTokenByAddress } from '@/lib/tokens'
import { extractEnsMintFallbackArgs } from '@/lib/ensFallback'
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
  const { writeContract, data: hash, isPending, isError, error } = useDynamicWriteContract()
  const receiptQuery = useReceiptPoller(hash)
  const { isLoading: isConfirming, isSuccess, receipt } = receiptQuery

  // Debug: trace the full create flow
  if (hash) {
    console.log('[useCreateDeal] hash:', hash, 'isConfirming:', isConfirming, 'isSuccess:', isSuccess, 'receipt:', !!receipt, 'receiptStatus:', receipt?.status, 'receiptError:', receiptQuery.isError, receiptQuery.error?.message)
  }

  // FACTORY WIRING (UC-1): call HandOffFactory.createHandOff() instead of deploying directly.
  // The factory atomically deploys a new HandOff escrow + registers it with HandOffReputation.
  function create(
    amount: string,
    _description: string,          // description is frontend-only; not stored on-chain
    timeoutHours: number,
    payoutTokenKey = 'ETH',
    sellerEns = '',
    sellerPayoutAddress: Address = '0x0000000000000000000000000000000000000000' as Address,
  ) {
    const token = TOKENS[payoutTokenKey]
    const payoutToken: Address = (token?.address ?? '0x0000000000000000000000000000000000000000') as Address
    const expirationWindow = BigInt(timeoutHours * 3600)

    writeContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'createHandOff',
      args: [payoutToken, parseEther(amount), expirationWindow, sellerEns, sellerPayoutAddress],
    })
  }

  // Parse HandOffCreated(seller, escrow, dealId) from the factory receipt.
  // All three params are indexed → each lives in topics[1..3]; data is empty.
  let newDealId: bigint | undefined
  let newEscrowAddress: Address | undefined
  if (receipt) {
    console.log('[useEscrowWrite] Receipt received, logs:', receipt.logs.length, 'status:', receipt.status)
    try {
      const logs = parseEventLogs({
        abi: FACTORY_ABI as Abi,
        logs: receipt.logs,
        eventName: 'HandOffCreated',
      })
      console.log('[useEscrowWrite] HandOffCreated logs found:', logs.length)
      if (logs.length > 0) {
        const args = logs[0].args as { seller: Address; escrow: Address; dealId: bigint }
        newDealId = args.dealId
        newEscrowAddress = args.escrow
        console.log('[useEscrowWrite] Parsed dealId:', newDealId?.toString(), 'escrow:', newEscrowAddress)
      }
    } catch (e) {
      console.warn('[useEscrowWrite] Failed to parse HandOffCreated event:', e)
      // Fallback: try to extract from raw log topics if parseEventLogs fails
      // HandOffCreated topic0 = keccak256("HandOffCreated(address,address,uint256)")
      for (const log of receipt.logs) {
        if (log.topics.length === 4 && log.address.toLowerCase() === FACTORY_ADDRESS.toLowerCase()) {
          console.log('[useEscrowWrite] Fallback: found factory log with 4 topics')
          try {
            // topics[1] = seller (address, padded), topics[2] = escrow, topics[3] = dealId
            newEscrowAddress = ('0x' + log.topics[2]!.slice(26)) as Address
            newDealId = BigInt(log.topics[3]!)
            console.log('[useEscrowWrite] Fallback parsed dealId:', newDealId.toString(), 'escrow:', newEscrowAddress)
          } catch (e2) {
            console.warn('[useEscrowWrite] Fallback parsing also failed:', e2)
          }
          break
        }
      }
    }
  }

  return { create, isPending, isConfirming, isSuccess, isError, error, newDealId, newEscrowAddress }
}

// Fund: call fund(codeHash, buyerEns) on the escrow contract directly.
// For ETH escrows (payoutToken = null/undefined), send msg.value.
// For ERC20 escrows, approve the escrow to pull tokens then call fund() with value = 0.
function useRealDepositFunds(dealId: bigint, escrowAddress?: Address) {
  const approveWrite = useDynamicWriteContract()
  const approveReceipt = useReceiptPoller(approveWrite.data)
  const { writeContract, data: hash, isPending, isError, error } = useDynamicWriteContract()
  const { isLoading: isConfirming, isSuccess } = useReceiptPoller(hash)

  // Store params for the chained fund() call after ERC20 approval
  const pendingFundRef = useRef<{
    codeHash: `0x${string}`; buyerEns: string; amount: bigint
  } | null>(null)

  function deposit(amount: string, codeHash: `0x${string}`, buyerEns = '', payoutToken?: Address | null) {
    console.log('[useEscrowWrite] deposit called:', { amount, codeHash, buyerEns, escrowAddress, payoutToken })
    if (!escrowAddress) { console.log('[useEscrowWrite] No escrowAddress, aborting deposit'); return }

    if (!payoutToken) {
      // ETH escrow: send native ETH as msg.value
      const value = parseEther(amount)
      console.log('[useEscrowWrite] ETH path, calling fund() with value:', value.toString())
      writeContract({
        address: escrowAddress,
        abi: HANDOFF_ABI,
        functionName: 'fund',
        args: [codeHash, buyerEns],
        value,
      })
    } else {
      // ERC20 escrow: step 1 = approve, step 2 = fund (chained via useEffect)
      const decimals = getTokenByAddress(payoutToken).decimals
      const tokenAmount = parseUnits(amount, decimals)
      console.log('[useEscrowWrite] ERC20 path, approving', payoutToken, 'decimals:', decimals, 'amount:', tokenAmount.toString())
      pendingFundRef.current = { codeHash, buyerEns, amount: tokenAmount }
      approveWrite.writeContract({
        address: payoutToken,
        abi: [{
          name: 'approve', type: 'function', stateMutability: 'nonpayable',
          inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
          outputs: [{ name: '', type: 'bool' }],
        }] as unknown as Abi,
        functionName: 'approve',
        args: [escrowAddress, tokenAmount],
      })
    }
  }

  // Chain: after ERC20 approval confirms, call fund() with value = 0
  useEffect(() => {
    const pendingFund = pendingFundRef.current
    if (approveReceipt.isSuccess && pendingFund && escrowAddress && !hash) {
      console.log('[useEscrowWrite] ERC20 approval confirmed, calling fund() with value: 0')
      writeContract({
        address: escrowAddress,
        abi: HANDOFF_ABI,
        functionName: 'fund',
        args: [pendingFund.codeHash, pendingFund.buyerEns],
        // No value — contract pulls tokens via safeTransferFrom
      })
      pendingFundRef.current = null
    }
  }, [approveReceipt.isSuccess, escrowAddress, hash, writeContract])

  const isApproving = approveWrite.isPending || (!!approveWrite.data && approveReceipt.isLoading)

  return {
    deposit,
    isPending: isPending || isApproving,
    isConfirming,
    isSuccess,
    isError: isError || approveWrite.isError,
    error: error || approveWrite.error,
  }
}

// Unlock: call unlock(submittedHash) — takes bytes32 hash, NOT plaintext
// After confirmation, also attempts cross-chain ENS subname minting on ETH Sepolia
// if SUBNAME_ADDRESS is configured (UC-16).
function useRealReleaseEscrow(dealId: bigint, escrowAddress?: Address) {
  const { writeContract, data: hash, isPending, isError, error } = useDynamicWriteContract()
  const receiptQuery = useReceiptPoller(hash)
  const { isLoading: isConfirming, isSuccess, receipt } = receiptQuery

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

  // UC-16: after unlock confirms, trigger ENS subname mint ONLY if on-chain call failed.
  // HandOff.unlock() already calls mintDealReceipt() directly (same-chain, gas: 500k).
  // The frontend fallback only fires when SubnameMintFailed is in the receipt — meaning
  // the on-chain call reverted and we need to retry from the wallet.
  useEffect(() => {
    if (!isSuccess || !receipt || SUBNAME_ADDRESS === '0x0000000000000000000000000000000000000000') return

    try {
      const args = extractEnsMintFallbackArgs(receipt.logs)
      if (!args) {
        // On-chain mint succeeded — nothing to do
        console.log('[useReleaseEscrow] ENS subname minted on-chain — skipping frontend fallback')
        return
      }

      console.log('[useReleaseEscrow] On-chain ENS mint failed — retrying from wallet for dealId:', args.dealId.toString())

      if (typeof window !== 'undefined' && (window as unknown as { ethereum?: unknown }).ethereum) {
        const ethProvider = (window as unknown as { ethereum: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum
        const walletClient = createWalletClient({ chain: sepolia, transport: custom(ethProvider) })

        ethProvider.request({ method: 'eth_requestAccounts' }).then(async (accounts) => {
          const accs = accounts as `0x${string}`[]
          if (accs.length === 0) return

          await walletClient.writeContract({
            address:      SUBNAME_ADDRESS,
            abi:          SUBNAME_ABI,
            functionName: 'mintDealReceipt',
            args:         [args.dealId, args.escrow, args.buyer, args.seller, args.amount, args.timestamp],
            account:      accs[0],
            chain:        sepolia,
            gas:          300_000n, // explicit cap — prevents MetaMask gas estimation overflow
          })
        }).catch((err: unknown) => {
          console.warn('[useReleaseEscrow] ENS subname mint fallback failed (non-blocking):', err)
        })
      }
    } catch (err) {
      console.warn('[useReleaseEscrow] Failed to parse ENS mint events (non-blocking):', err)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  return { release, isPending, isConfirming, isSuccess, isError, error }
}

// Refund: call refund() on escrow — no args
function useRealClaimRefund(dealId: bigint, escrowAddress?: Address) {
  const { writeContract, data: hash, isPending, isError, error } = useDynamicWriteContract()
  const { isLoading: isConfirming, isSuccess } = useReceiptPoller(hash)

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
  const { writeContract, data: hash, isPending, isError, error } = useDynamicWriteContract()
  const { isLoading: isConfirming, isSuccess } = useReceiptPoller(hash)

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
  const { writeContract, data: hash, isPending, isError, error } = useDynamicWriteContract()
  const { isLoading: isConfirming, isSuccess } = useReceiptPoller(hash)

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
  const { writeContract, data: hash, isPending, isError, error } = useDynamicWriteContract()
  const { isLoading: isConfirming, isSuccess } = useReceiptPoller(hash)

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
  function deposit(_amount: string, _codeHash: `0x${string}`, _buyerEns = '', _payoutToken?: Address | null) { trigger() }
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
