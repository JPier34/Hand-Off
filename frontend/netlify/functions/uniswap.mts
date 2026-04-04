import type { Context } from "@netlify/functions"

const UNISWAP_BASE = "https://trade-api.gateway.uniswap.org/v1"

export default async (request: Request, context: Context) => {
  // Extract the sub-path: /api/uniswap/quote → /quote
  const url = new URL(request.url)
  const subpath = url.pathname.replace(/^\/api\/uniswap\/?/, "")
  const target = `${UNISWAP_BASE}/${subpath}`

  // Read API key from server-side env (NOT exposed to client)
  const apiKey = process.env.UNISWAP_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "UNISWAP_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Forward the request to Uniswap with the API key added server-side
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
