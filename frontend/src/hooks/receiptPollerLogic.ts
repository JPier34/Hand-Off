import type { TransactionReceipt } from 'viem'

export const RECEIPT_TIMEOUT_MS = 120_000
export const RECEIPT_POLLING_INTERVAL_MS = 1_000

interface ReceiptClient {
  waitForTransactionReceipt: (args: {
    hash: `0x${string}`
    timeout: number
    pollingInterval: number
  }) => Promise<TransactionReceipt>
}

export function waitForReceipt(client: ReceiptClient, hash: `0x${string}`) {
  return client.waitForTransactionReceipt({
    hash,
    timeout: RECEIPT_TIMEOUT_MS,
    pollingInterval: RECEIPT_POLLING_INTERVAL_MS,
  })
}
