// Uniswap Trading API client
// Requests go to /api/uniswap/* which is proxied server-side:
// - Production (Netlify): Netlify Function adds the API key server-side
// - Dev: Vite proxy forwards to Uniswap API (API key added via dev proxy)
//   NOTE: If the proxy hasn't been restarted, DEV_API_KEY injects it client-side as a fallback.

const API_BASE = '/api/uniswap'

// Dev-only fallback: inject key client-side until the proxy is restarted (Sepolia testnet only)
// import.meta.env.DEV is false in production builds, so the key is never bundled for prod
const DEV_API_KEY = import.meta.env.DEV ? 'Hn15B01okvGodmX1Sx6m0qO_5xiWYgRlEDRUfpYIWb0' : ''

function buildHeaders(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (DEV_API_KEY) h['x-api-key'] = DEV_API_KEY
  return h
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuoteRequest {
  swapper:         string
  tokenIn:         string
  tokenOut:        string
  tokenInChainId:  string
  tokenOutChainId: string
  amount:          string
  type:            'EXACT_INPUT' | 'EXACT_OUTPUT'
  slippageTolerance?: number
}

export interface ClassicQuoteResponse {
  routing: 'CLASSIC' | 'WRAP' | 'UNWRAP'
  quote: {
    input:  { token: string; amount: string }
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
  to:       string
  from:     string
  data:     string
  value:    string
  chainId:  number
  gasLimit?: string
}

export interface SwapResponse {
  swap: SwapTransaction
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isUniswapXQuote(q: QuoteResponse): q is UniswapXQuoteResponse {
  return q.routing === 'DUTCH_V2' || q.routing === 'DUTCH_V3' || q.routing === 'PRIORITY'
}

// For EXACT_OUTPUT quotes: how much tokenOut the buyer receives (the USDC amount we requested)
export function getOutputAmount(q: QuoteResponse): string {
  if (isUniswapXQuote(q)) {
    const first = q.quote.orderInfo.outputs[0]
    if (!first) throw new Error('UniswapX quote has no outputs')
    return first.startAmount
  }
  return q.quote.output.amount
}

// For EXACT_OUTPUT quotes: how much tokenIn the buyer must pay (the WETH/token input amount)
export function getInputAmount(q: QuoteResponse): string {
  if (isUniswapXQuote(q)) {
    return q.quote.orderInfo.input.startAmount
  }
  return q.quote.input.amount
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchQuote(params: QuoteRequest): Promise<QuoteResponse> {
  const res = await fetch(`${API_BASE}/quote`, {
    method: 'POST',
    headers: buildHeaders(),
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
    headers: buildHeaders(),
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
    headers: buildHeaders(),
    body: JSON.stringify(request),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Swap failed')

  if (!data.swap?.data || data.swap.data === '' || data.swap.data === '0x') {
    throw new Error('Empty swap data — quote may have expired. Please refresh.')
  }

  return data
}
