import { useState, useEffect } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { MOCK_MODE, mockDeposit } from '@/lib/mock'
import { TOKENS, WETH_ADDRESS, type TokenKey } from '@/lib/tokens'
import { fetchQuote, getOutputAmount, type QuoteResponse } from '@/lib/uniswap'

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
  const { address } = useAccount()
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

function useRealSwapAndDeposit(_dealId: bigint, _tokenKey: TokenKey): SwapAndDepositState {
  const { data: walletClient } = useWalletClient()
  const [state, setState] = useState(IDLE_SWAP)

  function swapAndDeposit(_codeHash: `0x${string}`) {
    if (!walletClient) {
      setState({ ...IDLE_SWAP, isError: true, error: new Error('Wallet not connected') })
      return
    }
    // Real implementation would:
    // 1. checkApproval → approve if needed
    // 2. fetchSwap(quoteResponse) → get tx calldata
    // 3. walletClient.sendTransaction(swapTx)
    // 4. Wait for receipt → deposit into escrow
    // For hackathon: mock mode covers the demo; real mode needs deployed contract
    setState({ ...IDLE_SWAP, isError: true, error: new Error('Real swap not yet wired — use mock mode for demo') })
  }

  return { swapAndDeposit, ...state }
}

// ─── Public exports ───────────────────────────────────────────────────────────

export function useQuote(tokenKey: TokenKey, amountOutWei: bigint): QuoteResult {
  const real = useRealQuote(tokenKey, amountOutWei)
  const mock = useMockQuote(tokenKey, amountOutWei)
  return MOCK_MODE ? mock : real
}

export function useSwapAndDeposit(dealId: bigint, tokenKey: TokenKey): SwapAndDepositState {
  const real = useRealSwapAndDeposit(dealId, tokenKey)
  const mock = useMockSwapAndDeposit(dealId, tokenKey)
  return MOCK_MODE ? mock : real
}
