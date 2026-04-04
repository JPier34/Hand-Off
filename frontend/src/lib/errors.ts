/**
 * parseContractError — maps raw wagmi/viem errors to readable UI messages.
 *
 * Always logs the full error to console in dev so the raw message is
 * available for debugging without exposing it to users.
 */
/**
 * Returns null when the user simply cancelled — no red banner needed.
 * Returns a readable string for all real errors.
 */
export function parseContractError(error: Error | null | undefined): string | null {
  if (!error) return 'Something went wrong.'

  if (import.meta.env.DEV) {
    console.error('[contract error]', error)
  }

  const msg = error.message

  // User cancelled — silent, no banner
  if (/user rejected|user denied|rejected the request/i.test(msg))
    return null

  // Not enough gas money
  if (/insufficient funds/i.test(msg))
    return 'Not enough ETH for gas. Top up your wallet on Base Sepolia.'

  // Contract reverted — try to surface the reason string
  if (/execution reverted/i.test(msg)) {
    const reason = extractRevertReason(msg)
    if (reason) return `Transaction rejected: ${reason}`
    return 'Transaction rejected by the contract. Check deal status and try again.'
  }

  // Contract not found at address
  if (/contract not deployed|could not fetch|returned no data/i.test(msg))
    return 'Contract not found. VITE_MANAGER_ADDRESS may be wrong or the contract is not deployed yet.'

  // Wrong network (belt-and-suspenders — WrongNetworkBanner catches this earlier)
  if (/chain mismatch|wrong chain|unsupported chain/i.test(msg))
    return 'Wrong network. Switch to Base Sepolia in your wallet.'

  // Nonce collision (happens when a previous tx is still pending)
  if (/nonce too low|replacement transaction/i.test(msg))
    return 'Transaction conflict. Wait for the previous transaction to settle, then try again.'

  // RPC / network unreachable
  if (/network|fetch failed|failed to fetch|econnrefused/i.test(msg))
    return 'Network error. Check your internet connection and try again.'

  // ABI mismatch — function not found in contract
  if (/function .* not found|no matching function/i.test(msg))
    return 'ABI mismatch — the function was not found on the contract. Check constants.ts.'

  // Fallback — return raw message but trimmed
  return msg.split('\n')[0].slice(0, 120)
}

/**
 * Pull the revert reason string out of a viem error message.
 * viem formats it as: Error: execution reverted: <reason>
 * or: ContractFunctionExecutionError: ... reverted with the following reason:\n<reason>
 */
function extractRevertReason(msg: string): string | null {
  const patterns = [
    /reverted with the following reason:\s*\n?\s*(.+)/i,
    /execution reverted:\s*(.+)/i,
    /revert\s+(.+)/i,
  ]
  for (const pattern of patterns) {
    const match = msg.match(pattern)
    if (match?.[1]) return match[1].trim().slice(0, 80)
  }
  return null
}
