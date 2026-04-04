import { useState, useEffect } from 'react'
import { useReceiptPoller } from '@/hooks/useReceiptPoller'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'
import { useDynamicWriteContract } from '@/hooks/useDynamicWrite'
import { MOCK_MODE, mockDeposit } from '@/lib/mock'
import { TOKENS, WETH_ADDRESS, type TokenKey } from '@/lib/tokens'
import { fetchQuote, getOutputAmount, checkApproval, fetchSwap, type QuoteResponse } from '@/lib/uniswap'
import { HANDOFF_ABI, UNIVERSAL_ROUTER_ADDRESS } from '@/lib/constants'
import type { Address } from '@/lib/types'

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface QuoteResult {
  quotedIn:     bigint | undefined   // input token amount in token decimals
  quoteResponse: QuoteResponse | null // full API response for swap step
  isLoading:    boolean
  error:        string | null
}

export interface SwapAndDepositState {
  swapAndDeposit:      (codeHash: `0x${string}`) => void
  isApprovePending:    boolean
  isApproveConfirming: boolean
  isApproveSuccess:    boolean
  isSwapPending:       boolean
  isSwapConfirming:    boolean
  isSuccess:           boolean
  isError:             boolean
  error:               Error | null
}

const IDLE_SWAP: Omit<SwapAndDepositState, 'swapAndDeposit'> = {
  isApprovePending:    false,
  isApproveConfirming: false,
  isApproveSuccess:    false,
  isSwapPending:       false,
  isSwapConfirming:    false,
  isSuccess:           false,
  isError:             false,
  error:               null,
}

// ─── Mock: useQuote ───────────────────────────────────────────────────────────

function useMockQuote(tokenKey: TokenKey, amountOutWei: bigint): QuoteResult {
  const [isLoading, setIsLoading] = useState(false)
  const [quotedIn, setQuotedIn]   = useState<bigint | undefined>(undefined)

  useEffect(() => {
    const token = TOKENS[tokenKey]
    if (!token || tokenKey === 'ETH') { setQuotedIn(undefined); return }

    setIsLoading(true)
    setQuotedIn(undefined)
    const id = setTimeout(() => {
      // mockRate is "smallest unit per 1 ETH (10^18 wei)"
      // quotedIn = amountOutWei * mockRate / 10^18
      const result = (amountOutWei * token.mockRate) / 10n ** 18n
      setQuotedIn(result)
      setIsLoading(false)
    }, 400)

    return () => clearTimeout(id)
  }, [tokenKey, amountOutWei])

  return { quotedIn, quoteResponse: null, isLoading, error: null }
}

// ─── Real: useQuote ───────────────────────────────────────────────────────────

function useRealQuote(tokenKey: TokenKey, amountOutWei: bigint): QuoteResult {
  const { walletAddress: address } = useDynamicAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [quotedIn, setQuotedIn]   = useState<bigint | undefined>(undefined)
  const [quoteResponse, setQuoteResponse] = useState<QuoteResponse | null>(null)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    const token = TOKENS[tokenKey]
    if (!token || tokenKey === 'ETH' || !address || amountOutWei <= 0n) {
      setQuotedIn(undefined)
      setQuoteResponse(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const tokenIn = token.address
    if (!tokenIn) return

    // EXACT_OUTPUT: we know how much ETH the escrow needs, get the USDC cost
    fetchQuote({
      swapper:         address,
      tokenIn:         tokenIn,
      tokenOut:        WETH_ADDRESS,       // seller wants ETH → swap to WETH
      tokenInChainId:  '84532',            // Base Sepolia
      tokenOutChainId: '84532',
      amount:          amountOutWei.toString(),
      type:            'EXACT_OUTPUT',
      slippageTolerance: 0.5,
    })
      .then(resp => {
        if (cancelled) return
        const outputAmt = getOutputAmount(resp)
        setQuotedIn(BigInt(outputAmt))
        setQuoteResponse(resp)
        setIsLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [tokenKey, amountOutWei, address])

  return { quotedIn, quoteResponse, isLoading, error }
}

// ─── Mock: useSwapAndDeposit ──────────────────────────────────────────────────

function useMockSwapAndDeposit(dealId: bigint, tokenKey: TokenKey): SwapAndDepositState {
  const [state, setState] = useState(IDLE_SWAP)

  function swapAndDeposit(_codeHash: `0x${string}`) {
    if (tokenKey === 'ETH') return

    // Phase 1: approve
    setState({ ...IDLE_SWAP, isApprovePending: true })
    setTimeout(() => {
      setState({ ...IDLE_SWAP, isApproveConfirming: true })
      setTimeout(() => {
        setState({ ...IDLE_SWAP, isApproveSuccess: true })

        // Phase 2: swap + deposit
        setTimeout(() => {
          setState({ ...IDLE_SWAP, isApproveSuccess: true, isSwapPending: true })
          setTimeout(() => {
            setState({ ...IDLE_SWAP, isApproveSuccess: true, isSwapConfirming: true })
            setTimeout(() => {
              mockDeposit(dealId)
              setState({ ...IDLE_SWAP, isApproveSuccess: true, isSuccess: true })
            }, 1500)
          }, 1000)
        }, 300)

      }, 1500)
    }, 1000)
  }

  return { swapAndDeposit, ...state }
}

// ─── Real: useSwapAndDeposit ──────────────────────────────────────────────────

function useRealSwapAndDeposit(
  _dealId: bigint,
  _tokenKey: TokenKey,
  escrowAddress?: Address,
  quoteResponse?: QuoteResponse | null,
): SwapAndDepositState {
  const { walletAddress: address } = useDynamicAuth()
  const [state, setState] = useState(IDLE_SWAP)
  const [pendingCodeHash, setPendingCodeHash] = useState<`0x${string}` | null>(null)

  // Approval tx
  const approveWrite = useDynamicWriteContract()
  const approveReceipt = useReceiptPoller(approveWrite.data)

  // fundWithSwap tx
  const swapWrite = useDynamicWriteContract()
  const swapReceipt = useReceiptPoller(swapWrite.data)

  async function swapAndDeposit(codeHash: `0x${string}`) {
    setPendingCodeHash(codeHash)
    const token = TOKENS[_tokenKey]
    if (!address || !escrowAddress || !quoteResponse || !token?.address) {
      setState({ ...IDLE_SWAP, isError: true, error: new Error('Missing data for swap') })
      return
    }

    try {
      // Phase 1: Check if approval is needed
      setState({ ...IDLE_SWAP, isApprovePending: true })

      const inputAmount = getOutputAmount(quoteResponse) // for EXACT_OUTPUT, this is the input
      const approval = await checkApproval(address, token.address, inputAmount, 84532)

      if (approval) {
        // Need to approve — send approval tx via wallet
        approveWrite.writeContract({
          address: token.address as `0x${string}`,
          abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }] as const,
          functionName: 'approve',
          args: [escrowAddress, BigInt(inputAmount)],
        })
        setState({ ...IDLE_SWAP, isApproveConfirming: true })
        // Wait handled via useWaitForTransactionReceipt reactively
      } else {
        // Already approved — skip to swap
        setState({ ...IDLE_SWAP, isApproveSuccess: true, isSwapPending: true })
        executeSwap(codeHash, token.address as `0x${string}`, inputAmount, quoteResponse)
      }
    } catch (err) {
      setState({ ...IDLE_SWAP, isError: true, error: err instanceof Error ? err : new Error('Swap failed') })
    }
  }

  function executeSwap(codeHash: `0x${string}`, inputToken: `0x${string}`, inputAmount: string, quote: QuoteResponse) {
    fetchSwap(quote).then(swapResp => {
      swapWrite.writeContract({
        address: escrowAddress!,
        abi: HANDOFF_ABI,
        functionName: 'fundWithSwap',
        args: [
          UNIVERSAL_ROUTER_ADDRESS,
          inputToken,
          BigInt(inputAmount),
          swapResp.swap.data as `0x${string}`,
          codeHash,
          '', // buyerEns
        ],
      })
      setState(prev => ({ ...prev, isSwapPending: false, isSwapConfirming: true }))
    }).catch(err => {
      setState({ ...IDLE_SWAP, isError: true, error: err instanceof Error ? err : new Error('Swap failed') })
    })
  }

  // After approval confirms → trigger the actual swap using stored codeHash
  useEffect(() => {
    if (approveReceipt.isSuccess && !swapWrite.data && quoteResponse && pendingCodeHash) {
      const token = TOKENS[_tokenKey]
      if (!token?.address) return
      const inputAmount = getOutputAmount(quoteResponse)
      setState(prev => ({ ...prev, isApproveSuccess: true, isSwapPending: true }))
      executeSwap(pendingCodeHash, token.address as `0x${string}`, inputAmount, quoteResponse)
    }
  }, [approveReceipt.isSuccess, pendingCodeHash])

  // Map wagmi state to our state interface
  const derivedState: Omit<SwapAndDepositState, 'swapAndDeposit'> = {
    isApprovePending:    approveWrite.isPending,
    isApproveConfirming: !!approveWrite.data && approveReceipt.isLoading,
    isApproveSuccess:    approveReceipt.isSuccess,
    isSwapPending:       swapWrite.isPending,
    isSwapConfirming:    !!swapWrite.data && swapReceipt.isLoading,
    isSuccess:           swapReceipt.isSuccess,
    isError:             state.isError || approveWrite.isError || swapWrite.isError,
    error:               state.error || approveWrite.error || swapWrite.error || null,
  }

  return { swapAndDeposit, ...derivedState }
}

// ─── Public exports ───────────────────────────────────────────────────────────

export function useQuote(tokenKey: TokenKey, amountOutWei: bigint): QuoteResult {
  const real = useRealQuote(tokenKey, amountOutWei)
  const mock = useMockQuote(tokenKey, amountOutWei)
  return MOCK_MODE ? mock : real
}

export function useSwapAndDeposit(
  dealId: bigint,
  tokenKey: TokenKey,
  escrowAddress?: Address,
  quoteResponse?: QuoteResponse | null,
): SwapAndDepositState {
  const real = useRealSwapAndDeposit(dealId, tokenKey, escrowAddress, quoteResponse)
  const mock = useMockSwapAndDeposit(dealId, tokenKey)
  return MOCK_MODE ? mock : real
}
