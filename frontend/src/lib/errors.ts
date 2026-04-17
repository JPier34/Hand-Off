/**
 * parseContractError — maps raw wagmi/viem errors to readable UI messages.
 *
 * Inspects every field viem/ethers might stash the real cause in (message,
 * shortMessage, details, cause chain) so we match rejections even when the
 * top-level `message` is a full Request-Arguments dump.
 *
 * Returns null when the user simply cancelled — no red banner needed.
 * Returns a short readable string for all real errors.
 */

type ViemLike = {
  message?: string
  shortMessage?: string
  details?: string
  cause?: unknown
  code?: number | string
  name?: string
}

function collectErrorText(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  const parts: string[] = []
  const seen = new Set<unknown>()
  const queue: unknown[] = [error]
  while (queue.length > 0 && parts.length < 8) {
    const cur = queue.shift()
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue
    seen.add(cur)
    const e = cur as ViemLike
    if (e.shortMessage) parts.push(e.shortMessage)
    if (e.message) parts.push(e.message)
    if (e.details) parts.push(e.details)
    if (e.name) parts.push(e.name)
    if (e.cause) queue.push(e.cause)
  }
  return parts.join(' ')
}

export function parseContractError(error: Error | null | undefined | unknown): string | null {
  if (!error) return 'Something went wrong.'

  if (import.meta.env.DEV) {
    console.error('[contract error]', error)
  }

  const msg = collectErrorText(error)
  const code = (error as ViemLike).code

  // ── User cancelled in wallet — silent, no banner ─────────────────────────
  // MetaMask uses code 4001, WalletConnect varies. Match by code OR text.
  if (code === 4001 || code === 'ACTION_REJECTED') return null
  if (/user\s*(rejected|denied|cancelled|canceled)|rejected\s*the\s*request|action[_\s]rejected|denied\s*transaction\s*signature|user\s*closed/i.test(msg))
    return null

  // ── Gas / balance ────────────────────────────────────────────────────────
  if (/insufficient\s*funds|insufficient\s*balance|exceeds\s*balance/i.test(msg))
    return 'Not enough ETH for gas. Top up your wallet and try again.'

  // ── HandOff custom errors (from HandOff.sol) ─────────────────────────────
  if (/SellerCannotBeBuyer/i.test(msg))
    return 'You can\u2019t fund your own deal. Open the payment link from a different wallet.'
  if (/WrongETHAmount/i.test(msg))
    return 'Payment amount doesn\u2019t match. Refresh the page and try again.'
  if (/DealExpired|HandOffAlreadyExpired/i.test(msg))
    return 'This deal has expired.'
  if (/WrongState/i.test(msg))
    return 'This deal is no longer available for this action.'
  if (/WrongCodeHash/i.test(msg))
    return 'Incorrect code. Double-check with the buyer and try again.'
  if (/NotSeller/i.test(msg))
    return 'Only the seller can perform this action.'
  if (/NotBuyer/i.test(msg))
    return 'Only the buyer can claim a refund.'
  if (/NotYetExpired/i.test(msg))
    return 'This deal hasn\u2019t expired yet.'
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

  // ── Wallet / wallet-connection errors ────────────────────────────────────
  if (/timed?\s*out|request\s*timeout/i.test(msg))
    return 'Wallet didn\u2019t respond. Check your wallet app and try again.'
  if (/no\s*wallet\s*connected|no\s*wallet\s*account/i.test(msg))
    return 'No wallet connected. Please connect your wallet first.'
  if (/unauthorized|4100/i.test(msg))
    return 'Your wallet isn\u2019t authorised. Unlock it and try again.'

  // ── Network / chain ──────────────────────────────────────────────────────
  if (/chain\s*mismatch|wrong\s*chain|unsupported\s*chain|no\s*network\s*data/i.test(msg))
    return 'Wrong network. Switch to the correct chain in your wallet.'
  if (/nonce\s*too\s*low|replacement\s*transaction|already\s*known/i.test(msg))
    return 'Transaction conflict. Wait for the previous one to settle, then try again.'
  if (/fetch\s*failed|failed\s*to\s*fetch|econnrefused|network\s*(error|failed)/i.test(msg))
    return 'Network error. Check your internet connection and try again.'

  // ── Contract deployment / ABI ────────────────────────────────────────────
  if (/contract\s*not\s*deployed|could\s*not\s*fetch|returned\s*no\s*data/i.test(msg))
    return 'Contract not found. The deal address may be wrong or on the wrong network.'
  if (/function\s*.*\s*not\s*found|no\s*matching\s*function/i.test(msg))
    return 'Contract version mismatch. Please refresh the page.'

  // ── Generic revert — try to surface a reason string ──────────────────────
  if (/execution\s*reverted/i.test(msg)) {
    const reason = extractRevertReason(msg)
    if (reason) return `Transaction rejected: ${reason}`
    return 'Transaction rejected by the contract. Check the deal status and try again.'
  }

  // ── Fallback — never leak the raw viem Request-Arguments dump ────────────
  const short = (error as ViemLike).shortMessage
  if (short && short.length < 200) return short
  const first = msg.split('\n')[0].trim()
  if (!first) return 'Something went wrong. Please try again.'
  return first.length > 120 ? first.slice(0, 117) + '…' : first
}

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
