const UNISWAP_API_BASE = 'https://trade-api.gateway.uniswap.org/v1'

const FORWARDED_REQUEST_HEADERS = [
  'content-type',
  'x-universal-router-version',
]

exports.handler = async (event) => {
  const apiKey = process.env.UNISWAP_API_KEY
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ detail: 'UNISWAP_API_KEY is not configured on the server.' }),
    }
  }

  const path = event.queryStringParameters?.path ?? ''
  const upstreamUrl = `${UNISWAP_API_BASE}/${path}`.replace(/\/+$/, '')

  const headers = {
    'x-api-key': apiKey,
  }

  for (const header of FORWARDED_REQUEST_HEADERS) {
    const value = event.headers[header] ?? event.headers[header.toUpperCase()]
    if (value) headers[header] = value
  }

  try {
    const response = await fetch(upstreamUrl, {
      method: event.httpMethod,
      headers,
      body: event.httpMethod === 'GET' || event.httpMethod === 'HEAD' ? undefined : event.body,
    })

    const contentType = response.headers.get('content-type') ?? 'application/json'
    const body = await response.text()

    return {
      statusCode: response.status,
      headers: { 'content-type': contentType },
      body,
    }
  } catch (error) {
    return {
      statusCode: 502,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        detail: error instanceof Error ? error.message : 'Uniswap proxy request failed.',
      }),
    }
  }
}
