import { parseEventLogs } from 'viem'
import type { Abi } from 'viem'
import HandOffAbi from '../contracts/HandOff.abi.json'
import type { Address } from './types'

const HANDOFF_ABI = HandOffAbi as unknown as Abi

export interface EnsMintFallbackArgs {
  dealId: bigint
  escrow: Address
  buyer: Address
  seller: Address
  amount: bigint
  timestamp: bigint
}

export function extractEnsMintFallbackArgs(logs: readonly unknown[]): EnsMintFallbackArgs | null {
  try {
    const failedLogs = parseEventLogs({
      abi: HANDOFF_ABI as Abi,
      logs: logs as Parameters<typeof parseEventLogs>[0]['logs'],
      eventName: 'SubnameMintFailed',
    })

    if (failedLogs.length === 0) return null

    const requestedLogs = parseEventLogs({
      abi: HANDOFF_ABI as Abi,
      logs: logs as Parameters<typeof parseEventLogs>[0]['logs'],
      eventName: 'SubnameMintRequested',
    })

    if (requestedLogs.length === 0) return null

    return requestedLogs[0].args as EnsMintFallbackArgs
  } catch {
    return null
  }
}
