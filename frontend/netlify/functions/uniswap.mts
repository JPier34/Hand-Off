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

  const origin = request.headers.get("origin") ?? ""
  const isNetlifyPreview = /^https:\/\/[a-z0-9-]+--hand-off-1\.netlify\.app$/.test(origin)
  const allowed = ["https://app.hand-off.xyz", "https://hand-off.xyz", "https://www.hand-off.xyz"]
  const allowOrigin = allowed.includes(origin) || isNetlifyPreview ? origin : allowed[0]

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-api-key",
      },
    })
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowOrigin,
    },
  })
}

export const config = {
  path: "/api/uniswap/*",
}
