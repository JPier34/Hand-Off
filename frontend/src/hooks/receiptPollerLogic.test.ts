import { describe, expect, it, vi } from 'vitest'
import type { TransactionReceipt } from 'viem'
import {
  RECEIPT_POLLING_INTERVAL_MS,
  RECEIPT_TIMEOUT_MS,
  waitForReceipt,
} from './receiptPollerLogic'

const HASH = '0x1111111111111111111111111111111111111111111111111111111111111111' as const

function makeReceipt(status: 'success' | 'reverted'): TransactionReceipt {
  return {
    blockHash: HASH,
    blockNumber: 1n,
    contractAddress: null,
    cumulativeGasUsed: 1n,
    effectiveGasPrice: 1n,
    from: '0x1111111111111111111111111111111111111111',
    gasUsed: 1n,
    logs: [],
    logsBloom: '0x' + '0'.repeat(512),
    status,
    to: '0x2222222222222222222222222222222222222222',
    transactionHash: HASH,
    transactionIndex: 0,
    type: 'eip1559',
  } as TransactionReceipt
}

describe('waitForReceipt', () => {
  it('calls viem waitForTransactionReceipt with the expected timeout and polling interval', async () => {
    const receipt = makeReceipt('success')
    const waitForTransactionReceipt = vi.fn().mockResolvedValue(receipt)

    const result = await waitForReceipt({ waitForTransactionReceipt }, HASH)

    expect(result).toBe(receipt)
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: HASH,
      timeout: RECEIPT_TIMEOUT_MS,
      pollingInterval: RECEIPT_POLLING_INTERVAL_MS,
    })
  })

  it('propagates client errors unchanged', async () => {
    const failure = new Error('rpc failed')
    const waitForTransactionReceipt = vi.fn().mockRejectedValue(failure)

    await expect(waitForReceipt({ waitForTransactionReceipt }, HASH)).rejects.toThrow('rpc failed')
  })
})
