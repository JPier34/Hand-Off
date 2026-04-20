import type { Context } from "@netlify/functions"

const UNISWAP_BASE = "https://trade-api.gateway.uniswap.org/v1"

export default async (request: Request, context: Context) => {
  const url = new URL(request.url)
  // Two invocation paths:
  // 1. config.path catches /api/uniswap/quote → pathname = "/api/uniswap/quote"
  // 2. [[redirects]] rewrites /api/uniswap/* → /.netlify/functions/uniswap?path=quote
  const subpath =
    url.searchParams.get("path") ??
    url.pathname.replace(/^\/api\/uniswap\/?/, "").replace(/^\//, "")
  const target = `${UNISWAP_BASE}/${subpath}`

  const apiKey = process.env.UNISWAP_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "UNISWAP_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const headers = new Headers(request.headers)
  headers.set("x-api-key", apiKey)
  headers.set("x-universal-router-version", "2.0")
  headers.delete("host")

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method !== "GET" ? await request.text() : undefined,
  })

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

export const config = {
  path: "/api/uniswap/*",
}
