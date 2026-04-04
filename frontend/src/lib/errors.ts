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

  // HandOff custom errors (from HandOff.sol) — matched before generic revert
  if (/SellerCannotBeBuyer/i.test(msg))
    return 'You can\u2019t fund your own deal. The buyer needs to open the payment link from a different wallet.'
  if (/WrongETHAmount/i.test(msg))
    return 'Payment amount doesn\u2019t match. Refresh the page and try again.'
  if (/DealExpired/i.test(msg))
    return 'This deal has expired. The seller needs to create a new one.'
  if (/WrongState/i.test(msg))
    return 'This deal is no longer available for this action.'
  if (/WrongCodeHash/i.test(msg))
    return 'Incorrect code. Double-check with the buyer and try again.'
  if (/NotSeller/i.test(msg))
    return 'Only the seller can perform this action.'
  if (/NotBuyer/i.test(msg))
    return 'Only the buyer can claim a refund.'
  if (/NotYetExpired/i.test(msg))
    return 'This deal hasn\u2019t expired yet. Refunds become available after expiration.'
  if (/HandOffAlreadyExpired/i.test(msg))
    return 'This deal has expired. The buyer can now claim a refund.'
  if (/NotParticipant/i.test(msg))
    return 'Only the buyer or seller can leave a review.'
  if (/ETHForbiddenForTokenEscrow/i.test(msg))
    return 'This deal expects a token payment, not ETH.'
  if (/SlippageExceeded/i.test(msg))
    return 'Swap slippage too high. Try again or use a different token.'
  if (/SwapCallReverted/i.test(msg))
    return 'Token swap failed. Try again or pay directly with the requested token.'
  if (/ZeroCodeHash/i.test(msg))
    return 'Code generation failed. Refresh the page and try again.'

  // Generic contract revert — try to surface the reason string
  if (/execution reverted/i.test(msg)) {
    const reason = extractRevertReason(msg)
    if (reason) return `Transaction rejected: ${reason}`
    return 'Transaction rejected by the contract. Check deal status and try again.'
  }

  // Wallet errors
  if (/timed out/i.test(msg))
    return 'Wallet didn\u2019t respond. Check your wallet for a pending request, or try again.'
  if (/no wallet connected/i.test(msg))
    return 'No wallet connected. Please connect your wallet first.'
  if (/error sending/i.test(msg))
    return 'Your wallet rejected the transaction. Check the details and try again.'

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
