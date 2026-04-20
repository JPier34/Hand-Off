import { z } from 'zod'

// Uniswap Trading API client
// Requests go to /api/uniswap/* which is proxied server-side:
// - Production (Netlify): Netlify Function injects UNISWAP_API_KEY server-side (never in bundle)
// - Dev: Vite proxy forwards to Uniswap API; set VITE_UNISWAP_API_KEY in .env.local for auth

const API_BASE = '/api/uniswap'

function buildHeaders(): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-universal-router-version': '2.0',
  }
  // In dev only, read key from env var — never hardcoded, never in prod bundle
  if (import.meta.env.DEV && import.meta.env.VITE_UNISWAP_API_KEY) {
    h['x-api-key'] = import.meta.env.VITE_UNISWAP_API_KEY as string
  }
  return h
}

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/)
const hexSchema = z.string().regex(/^0x([a-fA-F0-9]{2})*$/)
const numericStringSchema = z.string().regex(/^\d+$/)

const apiErrorSchema = z.object({
  detail: z.string().optional(),
  message: z.string().optional(),
}).passthrough()

const classicQuoteResponseSchema = z.object({
  routing: z.enum(['CLASSIC', 'WRAP', 'UNWRAP']),
  quote: z.object({
    input: z.object({
      token: addressSchema,
      amount: numericStringSchema,
    }),
    output: z.object({
      token: addressSchema,
      amount: numericStringSchema,
    }),
    slippage: z.number().optional(),
    gasFee: z.string().optional(),
    gasFeeUSD: z.string().optional(),
    gasUseEstimate: z.string().optional(),
  }).passthrough(),
  permitData: z.record(z.unknown()).nullable(),
})

const uniswapXQuoteResponseSchema = z.object({
  routing: z.enum(['DUTCH_V2', 'DUTCH_V3', 'PRIORITY']),
  quote: z.object({
    orderInfo: z.object({
      outputs: z.array(z.object({
        token: addressSchema,
        startAmount: numericStringSchema,
        endAmount: numericStringSchema,
        recipient: addressSchema,
      })).min(1),
      input: z.object({
        token: addressSchema,
        startAmount: numericStringSchema,
        endAmount: numericStringSchema,
      }),
      deadline: z.number(),
      nonce: z.string(),
    }),
    encodedOrder: hexSchema,
    orderHash: hexSchema,
  }),
  permitData: z.record(z.string(), z.unknown()).nullable(),
})

const quoteResponseSchema = z.union([classicQuoteResponseSchema, uniswapXQuoteResponseSchema])

const approvalTransactionSchema = z.object({
  to: addressSchema,
  data: hexSchema,
  value: numericStringSchema,
})

const approvalResponseSchema = z.object({
  approval: approvalTransactionSchema.nullish(),
}).passthrough()

const swapTransactionSchema = z.object({
  to: addressSchema,
  from: addressSchema,
  data: hexSchema,
  value: numericStringSchema,
  chainId: z.number(),
  gasLimit: numericStringSchema.optional(),
})

const swapResponseSchema = z.object({
  swap: swapTransactionSchema,
})

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

export type ClassicQuoteResponse = z.infer<typeof classicQuoteResponseSchema>
export type UniswapXQuoteResponse = z.infer<typeof uniswapXQuoteResponseSchema>
export type QuoteResponse = z.infer<typeof quoteResponseSchema>
export type SwapTransaction = z.infer<typeof swapTransactionSchema>
export type SwapResponse = z.infer<typeof swapResponseSchema>

function getApiErrorMessage(payload: unknown, fallback: string) {
  const parsed = apiErrorSchema.safeParse(payload)
  if (!parsed.success) return fallback
  return parsed.data.detail || parsed.data.message || fallback
}

export function parseQuoteResponse(payload: unknown): QuoteResponse {
  const parsed = quoteResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('Invalid quote response from Uniswap API')
  }
  return parsed.data
}

export function parseApprovalResponse(payload: unknown): { to: string; data: string; value: string } | null {
  const parsed = approvalResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('Invalid approval response from Uniswap API')
  }
  return parsed.data.approval ?? null
}

export function parseSwapResponse(payload: unknown): SwapResponse {
  const parsed = swapResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('Invalid swap response from Uniswap API')
  }
  if (!parsed.data.swap.data || parsed.data.swap.data === '0x') {
    throw new Error('Empty swap data — quote may have expired. Please refresh.')
  }
  return parsed.data
}

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
  if (!res.ok) throw new Error(getApiErrorMessage(data, 'Quote failed'))
  return parseQuoteResponse(data)
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
  if (!res.ok) throw new Error(getApiErrorMessage(data, 'Approval check failed'))
  return parseApprovalResponse(data)
}

export async function fetchSwap(
  quoteResponse: QuoteResponse,
  signature?: string,
): Promise<SwapResponse> {
  const { permitData, ...cleanQuote } = quoteResponse as QuoteResponse & { permitData?: unknown }
  const request: Record<string, unknown> = { ...cleanQuote }

  if (isUniswapXQuote(quoteResponse)) {
    if (signature) request.signature = signature
  } else if (signature && permitData && typeof permitData === 'object') {
    request.signature = signature
    request.permitData = permitData
  }

  const res = await fetch(`${API_BASE}/swap`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(request),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(getApiErrorMessage(data, 'Swap failed'))
  return parseSwapResponse(data)
}
