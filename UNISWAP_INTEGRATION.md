# Uniswap Integration — HandOff

## Overview

HandOff integrates the **Uniswap Trading API** to allow buyers to pay with any ERC-20 token regardless of what the seller requests. The swap and the escrow deposit happen atomically in a single on-chain transaction.

---

## Architecture

```
Browser (Buyer)
     │
     │  POST /api/uniswap/quote        (no API key in browser)
     ▼
Netlify Function  ─── injects x-api-key header ──►  Uniswap Trading API
(uniswap.mts)                                        trade-api.gateway.uniswap.org/v1
     │
     │  returns swap calldata
     ▼
Browser calls fundWithSwap() on HandOff.sol
     │
     ▼
HandOff.sol (ETH Sepolia)
  ├── pulls inputToken from buyer (safeTransferFrom)
  ├── approves Universal Router 2.0 for exact input amount
  ├── calls router with Trading API calldata  ← atomic
  ├── verifies output ≥ required amount (slippage check)
  └── sets state = FUNDED, emits HandOffFunded
```

---

## Why the Trading API (not SwapRouter directly)

The Uniswap Trading API returns optimal routes across all Uniswap liquidity sources and generates the exact calldata for Universal Router 2.0. Using the API directly means:

- **Best execution** — routing considers V2, V3, and V4 pools
- **Slippage protection** — API returns a quoted output; the contract enforces it
- **No client-side route computation** — no need to run the router SDK in the browser

The API key is **never exposed in the client bundle**. All three Trading API endpoints (`/quote`, `/check_approval`, `/swap`) are proxied through `frontend/netlify/functions/uniswap.mts`, which injects the `x-api-key` and `x-universal-router-version: 2.0` headers server-side.

---

## Key Files

| File | Role |
|------|------|
| `frontend/netlify/functions/uniswap.mts` | Server-side proxy — injects API key, forwards to `trade-api.gateway.uniswap.org/v1` |
| `frontend/src/lib/uniswap.ts` | Client — `fetchQuote()`, `checkApproval()`, `fetchSwap()` |
| `frontend/src/hooks/useTokenSwap.ts` | React hook — orchestrates quote → approve → `fundWithSwap()` |
| `contracts/contracts/HandOff.sol` | `fundWithSwap()` — atomic swap + escrow deposit |

---

## fundWithSwap() — Contract Function

```solidity
function fundWithSwap(
    address _router,       // must equal ALLOWED_ROUTER (Universal Router 2.0)
    address _inputToken,   // token buyer is paying with
    uint256 _inputAmount,  // max input tokens to pull from buyer
    bytes calldata _swapData,  // calldata from Uniswap Trading API
    bytes32 _codeHash,     // keccak256(unlockCode) chosen by buyer
    string calldata _buyerEns
) external nonReentrant inState(State.CREATED)
```

**Atomic guarantee:** The function is `nonReentrant` and either the swap + deposit both succeed, or the entire transaction reverts. The buyer's tokens are never left in limbo.

**Router allowlist:** `ALLOWED_ROUTER` is set immutably at construction time to `0x492e6456d9528771018deb9e87ef7750ef184104` (Uniswap Universal Router 2.0 on ETH Sepolia). No other router address is accepted.

---

## Example Flow

1. Seller creates a deal requesting **100 USDC**
2. Buyer opens the payment link, selects **ETH** as their input token
3. Frontend calls `fetchQuote()` → Trading API returns the ETH amount needed
4. Buyer clicks Fund → frontend calls `fetchSwap()` → Trading API returns swap calldata
5. Buyer approves the HandOff contract to pull their ETH (if ERC-20) or sends ETH directly
6. `fundWithSwap()` is called with the Trading API calldata:
   - Pulls ETH from buyer
   - Calls Universal Router 2.0 with the Trading API calldata
   - Verifies ≥ 100 USDC landed in the contract
   - Sets state = FUNDED

---

## Live Testnet Transactions (ETH Sepolia)

| Transaction | Hash |
|-------------|------|
| `fundWithSwap()` — token swap + escrow deposit | [INSERT TX HASH] |
| `unlock()` — funds released to seller | [INSERT TX HASH] |

> Run `scripts/demo-swap.ts` to generate a real transaction: `npx tsx scripts/demo-swap.ts`

---

## Router Address Verification

The `ALLOWED_ROUTER` passed to `HandOffFactory` at deployment is recorded in the Hardhat Ignition journal at `contracts/ignition/deployments/chain-11155111/journal.jsonl`:

```json
{
  "constructorArgs": [
    "0x6F27405a3b38952DF88aea5F1B7F5b546D7a328a",
    "0x0000000000000000000000000000000000000000",
    "0x492e6456d9528771018deb9e87ef7750ef184104"
  ]
}
```

The third argument (`0x492e6456...`) is Universal Router 2.0 on ETH Sepolia — confirmed against the [Uniswap deployment registry](https://docs.uniswap.org/contracts/v3/reference/deployments).
