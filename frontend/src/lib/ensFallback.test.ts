import { describe, expect, it } from 'vitest'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import HandOffAbi from '../contracts/HandOff.abi.json'
import { extractEnsMintFallbackArgs } from './ensFallback'

const HANDOFF_ABI = HandOffAbi as const

const DEAL_ID = 42n
const ESCROW = '0x1111111111111111111111111111111111111111' as const
const BUYER = '0x2222222222222222222222222222222222222222' as const
const SELLER = '0x3333333333333333333333333333333333333333' as const
const AMOUNT = 123n
const TIMESTAMP = 456n

function makeLog(eventName: 'SubnameMintFailed' | 'SubnameMintRequested') {
  if (eventName === 'SubnameMintFailed') {
    const topics = encodeEventTopics({
      abi: HANDOFF_ABI,
      eventName,
      args: [DEAL_ID],
    })
    return { address: ESCROW, topics, data: '0x' }
  }

  const topics = encodeEventTopics({
    abi: HANDOFF_ABI,
    eventName,
    args: [DEAL_ID, ESCROW],
  })
  const data = encodeAbiParameters(
    [
      { name: 'buyer', type: 'address' },
      { name: 'seller', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
    ],
    [BUYER, SELLER, AMOUNT, TIMESTAMP],
  )
  return { address: ESCROW, topics, data }
}

describe('extractEnsMintFallbackArgs', () => {
  it('returns null when on-chain ENS mint did not fail', () => {
    const args = extractEnsMintFallbackArgs([makeLog('SubnameMintRequested')])
    expect(args).toBeNull()
  })

  it('returns fallback mint args when failure and request events are both present', () => {
    const args = extractEnsMintFallbackArgs([
      makeLog('SubnameMintFailed'),
      makeLog('SubnameMintRequested'),
    ])

    expect(args).toEqual({
      dealId: DEAL_ID,
      escrow: ESCROW,
      buyer: BUYER,
      seller: SELLER,
      amount: AMOUNT,
      timestamp: TIMESTAMP,
    })
  })

  it('returns null when logs are malformed or incomplete', () => {
    expect(extractEnsMintFallbackArgs([{ data: '0x', topics: [] }])).toBeNull()
    expect(extractEnsMintFallbackArgs([makeLog('SubnameMintFailed')])).toBeNull()
  })
})
