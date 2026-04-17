import { useState, useEffect, useRef } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { useReceiptPoller } from '@/hooks/useReceiptPoller'
import { useDynamicWriteContract } from '@/hooks/useDynamicWrite'
import { MOCK_MODE, mockDeposit } from '@/lib/mock'
import { TOKENS, type TokenKey, payoutDecimals } from '@/lib/tokens'
import { fetchQuote, getOutputAmount, checkApproval, fetchSwap, type QuoteResponse } from '@/lib/uniswap'
import { HANDOFF_ABI, UNIVERSAL_ROUTER_ADDRESS } from '@/lib/constants'
import type { Address } from '@/lib/types'
import { buildExactOutputQuoteRequest } from '@/lib/swapQuoteLogic'
import { getTargetChainId } from '@/lib/chains'

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
  txHash:              `0x${string}` | undefined
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
  txHash:              undefined,
}

// ─── Mock: useQuote ───────────────────────────────────────────────────────────

function useMockQuote(tokenKey: TokenKey, amountOutWei: bigint, payoutToken: Address | null, _slippage = 0.5): QuoteResult {
  const [state, setState] = useState<{ requestKey: string | null; quotedIn: bigint | undefined }>({
    requestKey: null,
    quotedIn: undefined,
  })

  useEffect(() => {
    const token = TOKENS[tokenKey]
    if (!token || tokenKey === 'ETH' || !payoutToken) return

    const requestKey = `${tokenKey}:${amountOutWei.toString()}:${payoutToken}`

    const id = setTimeout(() => {
      // mockRate is "smallest unit per 1 ETH (10^18 wei)".
      // Normalise amountOutWei to an 18-decimal base so the rate math
      // works regardless of the payout token's decimals (USDC=6, WETH=18, …).
      const outDec = payoutDecimals(payoutToken)
      const normalised = outDec === 18
        ? amountOutWei
        : amountOutWei * 10n ** BigInt(18 - outDec)
      const result = (normalised * token.mockRate) / 10n ** 18n
      setState({ requestKey, quotedIn: result })
    }, 400)

    return () => clearTimeout(id)
  }, [tokenKey, amountOutWei, payoutToken])

  const token = TOKENS[tokenKey]
  const supported = !!token && tokenKey !== 'ETH' && !!payoutToken
  const requestKey = supported ? `${tokenKey}:${amountOutWei.toString()}:${payoutToken}` : null
  const isLoading = !!requestKey && state.requestKey !== requestKey
  const quotedIn = state.requestKey === requestKey ? state.quotedIn : undefined

  return { quotedIn, quoteResponse: null, isLoading, error: null }
}

// ─── Real: useQuote ───────────────────────────────────────────────────────────

function useRealQuote(tokenKey: TokenKey, amountOutWei: bigint, payoutToken: Address | null, slippage = 0.5): QuoteResult {
  const { address } = useAccount()
  const [state, setState] = useState<{
    requestKey: string | null
    quotedIn: bigint | undefined
    quoteResponse: QuoteResponse | null
    error: string | null
  }>({
    requestKey: null,
    quotedIn: undefined,
    quoteResponse: null,
    error: null,
  })

  useEffect(() => {
    const quoteRequest = buildExactOutputQuoteRequest({
      swapper: address,
      tokenKey,
      amountOutWei,
      payoutToken,
      slippage,
    })

    if (!quoteRequest) return

    let cancelled = false
    const requestKey = JSON.stringify(quoteRequest)

    fetchQuote(quoteRequest)
      .then(resp => {
        if (cancelled) return
        const outputAmt = getOutputAmount(resp)
        setState({
          requestKey,
          quotedIn: BigInt(outputAmt),
          quoteResponse: resp,
          error: null,
        })
      })
      .catch(err => {
        if (cancelled) return
        setState({
          requestKey,
          quotedIn: undefined,
          quoteResponse: null,
          error: err.message,
        })
      })

    return () => { cancelled = true }
  }, [tokenKey, amountOutWei, address, payoutToken, slippage])

  const quoteRequest = buildExactOutputQuoteRequest({
    swapper: address,
    tokenKey,
    amountOutWei,
    payoutToken,
    slippage,
  })
  const requestKey = quoteRequest ? JSON.stringify(quoteRequest) : null
  const isLoading = !!requestKey && state.requestKey !== requestKey
  const quotedIn = state.requestKey === requestKey ? state.quotedIn : undefined
  const quoteResponse = state.requestKey === requestKey ? state.quoteResponse : null
  const error = state.requestKey === requestKey ? state.error : null

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
  const { address } = useAccount()
  const [state, setState] = useState(IDLE_SWAP)
  // Store codeHash across the async approval → swap boundary
  const pendingCodeHashRef = useRef<`0x${string}` | null>(null)

  // Sanity-check: the router we pass to fundWithSwap must match ALLOWED_ROUTER
  // on the escrow, otherwise the contract reverts with DisallowedRouter and
  // the user pays gas for nothing. Read once when the escrow is known.
  const allowedRouterResult = useReadContract({
    address: escrowAddress,
    abi: HANDOFF_ABI,
    functionName: 'ALLOWED_ROUTER',
    query: { enabled: !!escrowAddress },
  })
  const allowedRouter = allowedRouterResult.data as `0x${string}` | undefined

  useEffect(() => {
    if (!allowedRouter) return
    if (allowedRouter.toLowerCase() !== UNIVERSAL_ROUTER_ADDRESS.toLowerCase()) {
      console.warn(
        '[useSwapAndDeposit] Router mismatch — escrow ALLOWED_ROUTER =',
        allowedRouter,
        'but frontend UNIVERSAL_ROUTER_ADDRESS =',
        UNIVERSAL_ROUTER_ADDRESS,
      )
    }
  }, [allowedRouter])

  // Approval tx
  const approveWrite = useDynamicWriteContract()
  const approveReceipt = useReceiptPoller(approveWrite.data)

  // fundWithSwap tx
  const swapWrite = useDynamicWriteContract()
  const swapReceipt = useReceiptPoller(swapWrite.data)

  async function swapAndDeposit(codeHash: `0x${string}`) {
    const token = TOKENS[_tokenKey]
    if (!address || !escrowAddress || !quoteResponse || !token?.address) {
      setState({ ...IDLE_SWAP, isError: true, error: new Error('Missing data for swap') })
      return
    }
    if (allowedRouter && allowedRouter.toLowerCase() !== UNIVERSAL_ROUTER_ADDRESS.toLowerCase()) {
      setState({
        ...IDLE_SWAP,
        isError: true,
        error: new Error(
          'Swap is disabled — the Uniswap router on the escrow contract does not match the one configured in this app. Ask the team to update UNIVERSAL_ROUTER_ADDRESS.',
        ),
      })
      return
    }

    // Persist codeHash so the approval useEffect can use it
    pendingCodeHashRef.current = codeHash

    try {
      setState({ ...IDLE_SWAP, isApprovePending: true })

      const inputAmount = getOutputAmount(quoteResponse) // for EXACT_OUTPUT, this is the input amount
      const approval = await checkApproval(address, token.address, inputAmount, getTargetChainId())

      if (approval) {
        // Need to approve — swap will be triggered reactively after confirmation
        approveWrite.writeContract({
          address: token.address as `0x${string}`,
          abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }] as const,
          functionName: 'approve',
          args: [escrowAddress, BigInt(inputAmount)],
        })
        setState({ ...IDLE_SWAP, isApproveConfirming: true })
      } else {
        // Already approved — go straight to swap
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

  // After approval confirms → fire the swap using the stored codeHash
  useEffect(() => {
    if (!approveReceipt.isSuccess || swapWrite.data || !quoteResponse || !pendingCodeHashRef.current) return
    const token = TOKENS[_tokenKey]
    if (!token?.address) return
    const inputAmount = getOutputAmount(quoteResponse)
    const codeHash = pendingCodeHashRef.current
    pendingCodeHashRef.current = null
    setState(prev => ({ ...prev, isApproveSuccess: true, isSwapPending: true }))
    executeSwap(codeHash, token.address as `0x${string}`, inputAmount, quoteResponse)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isSuccess])

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
    txHash:              swapWrite.data,
  }

  return { swapAndDeposit, ...derivedState }
}

// ─── Public exports ───────────────────────────────────────────────────────────

export function useQuote(tokenKey: TokenKey, amountOutWei: bigint, payoutToken: Address | null, slippage = 0.5): QuoteResult {
  const real = useRealQuote(tokenKey, amountOutWei, payoutToken, slippage)
  const mock = useMockQuote(tokenKey, amountOutWei, payoutToken, slippage)
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
