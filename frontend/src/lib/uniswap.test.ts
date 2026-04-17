import { describe, expect, it } from 'vitest'
import {
  getInputAmount,
  parseApprovalResponse,
  parseQuoteResponse,
  parseSwapResponse,
} from './uniswap'

describe('uniswap payload validation', () => {
  it('parses a valid classic quote response', () => {
    const quote = parseQuoteResponse({
      routing: 'CLASSIC',
      quote: {
        input: { token: '0x1111111111111111111111111111111111111111', amount: '1000000' },
        output: { token: '0x2222222222222222222222222222222222222222', amount: '999000' },
        slippage: 0.5,
        gasFee: '21000',
        gasFeeUSD: '1.23',
        gasUseEstimate: '21000',
      },
      permitData: null,
    })

    expect(quote.routing).toBe('CLASSIC')
    expect(getInputAmount(quote)).toBe('1000000')
  })

  it('parses a valid UniswapX quote response', () => {
    const quote = parseQuoteResponse({
      routing: 'DUTCH_V2',
      quote: {
        orderInfo: {
          outputs: [{
            token: '0x2222222222222222222222222222222222222222',
            startAmount: '555',
            endAmount: '550',
            recipient: '0x3333333333333333333333333333333333333333',
          }],
          input: {
            token: '0x1111111111111111111111111111111111111111',
            startAmount: '600',
            endAmount: '650',
          },
          deadline: 1234567890,
          nonce: '1',
        },
        encodedOrder: '0x1234',
        orderHash: '0xabcd',
      },
      permitData: null,
    })

    expect(quote.routing).toBe('DUTCH_V2')
    expect(getInputAmount(quote)).toBe('600')
  })

  it('rejects malformed quote payloads', () => {
    expect(() => parseQuoteResponse({
      routing: 'CLASSIC',
      quote: {
        input: { token: '0x1111111111111111111111111111111111111111', amount: '1000000' },
      },
    })).toThrow('Invalid quote response from Uniswap API')
  })

  it('parses approval payloads and allows null approvals', () => {
    expect(parseApprovalResponse({
      approval: {
        to: '0x1111111111111111111111111111111111111111',
        data: '0x1234',
        value: '0',
      },
    })).toEqual({
      to: '0x1111111111111111111111111111111111111111',
      data: '0x1234',
      value: '0',
    })

    expect(parseApprovalResponse({ approval: null })).toBeNull()
  })

  it('rejects malformed approval payloads', () => {
    expect(() => parseApprovalResponse({
      approval: {
        to: 'not-an-address',
        data: '0x1234',
        value: '0',
      },
    })).toThrow('Invalid approval response from Uniswap API')
  })

  it('parses valid swap payloads and rejects empty swap data', () => {
    expect(parseSwapResponse({
      swap: {
        to: '0x1111111111111111111111111111111111111111',
        from: '0x2222222222222222222222222222222222222222',
        data: '0x1234',
        value: '0',
        chainId: 11155111,
      },
    })).toMatchObject({
      swap: {
        data: '0x1234',
      },
    })

    expect(() => parseSwapResponse({
      swap: {
        to: '0x1111111111111111111111111111111111111111',
        from: '0x2222222222222222222222222222222222222222',
        data: '0x',
        value: '0',
        chainId: 11155111,
      },
    })).toThrow('Empty swap data')
  })
})
