// Uniswap Trading API client
// Uses CORS proxy in dev (/api/uniswap → trade-api.gateway.uniswap.org/v1)
// and Vercel rewrite in production.

const API_BASE = '/api/uniswap'
const API_KEY = import.meta.env.UNISWAP_API_KEY ?? ''

const HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
  'x-universal-router-version': '2.0',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuoteRequest {
  swapper: string
  tokenIn: string
  tokenOut: string
  tokenInChainId: string
  tokenOutChainId: string
  amount: string
  type: 'EXACT_INPUT' | 'EXACT_OUTPUT'
  slippageTolerance?: number
}

export interface ClassicQuoteResponse {
  routing: 'CLASSIC' | 'WRAP' | 'UNWRAP'
  quote: {
    input: { token: string; amount: string }
    output: { token: string; amount: string }
    slippage: number
    gasFee: string
    gasFeeUSD: string
    gasUseEstimate: string
  }
  permitData: Record<string, unknown> | null
}

interface DutchOrderOutput {
  token: string
  startAmount: string
  endAmount: string
  recipient: string
}

export interface UniswapXQuoteResponse {
  routing: 'DUTCH_V2' | 'DUTCH_V3' | 'PRIORITY'
  quote: {
    orderInfo: {
      outputs: DutchOrderOutput[]
      input: { token: string; startAmount: string; endAmount: string }
      deadline: number
      nonce: string
    }
    encodedOrder: string
    orderHash: string
  }
  permitData: Record<string, unknown> | null
}

export type QuoteResponse = ClassicQuoteResponse | UniswapXQuoteResponse

export interface SwapTransaction {
  to: string
  from: string
  data: string
  value: string
  chainId: number
  gasLimit?: string
}

export interface SwapResponse {
  swap: SwapTransaction
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isUniswapXQuote(q: QuoteResponse): q is UniswapXQuoteResponse {
  return q.routing === 'DUTCH_V2' || q.routing === 'DUTCH_V3' || q.routing === 'PRIORITY'
}

export function getOutputAmount(q: QuoteResponse): string {
  if (isUniswapXQuote(q)) {
    const first = q.quote.orderInfo.outputs[0]
    if (!first) throw new Error('UniswapX quote has no outputs')
    return first.startAmount
  }
  return q.quote.output.amount
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchQuote(params: QuoteRequest): Promise<QuoteResponse> {
  const res = await fetch(`${API_BASE}/quote`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      ...params,
      slippageTolerance: params.slippageTolerance ?? 0.5,
      routingPreference: 'BEST_PRICE',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Quote failed')
  return data
}

export async function checkApproval(
  walletAddress: string,
  token: string,
  amount: string,
  chainId: number,
): Promise<{ to: string; data: string; value: string } | null> {
  const res = await fetch(`${API_BASE}/check_approval`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ walletAddress, token, amount, chainId }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Approval check failed')
  return data.approval ?? null
}

export async function fetchSwap(
  quoteResponse: QuoteResponse,
  signature?: string,
): Promise<SwapResponse> {
  const { permitData, ...cleanQuote } = quoteResponse as QuoteResponse & { permitData?: unknown }
  const request: Record<string, unknown> = { ...cleanQuote }

  if (isUniswapXQuote(quoteResponse)) {
    if (signature) request.signature = signature
  } else {
    if (signature && permitData && typeof permitData === 'object') {
      request.signature = signature
      request.permitData = permitData
    }
  }

  const res = await fetch(`${API_BASE}/swap`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(request),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Swap failed')

  if (!data.swap?.data || data.swap.data === '' || data.swap.data === '0x') {
    throw new Error('Empty swap data — quote may have expired. Please refresh.')
  }

  return data
}
