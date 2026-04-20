# HandOff

**Peer-to-peer escrow for in-person transactions — no middleman, no trust required.**

> Built at **ETHGlobal Cannes 2026** · Sponsor tracks: ENS · Uniswap · Dynamic.xyz

---

## The Problem

When strangers trade in person, someone has to go first. The buyer risks sending money before receiving the item. The seller risks handing over the item before receiving payment. Bank transfers can be reversed. Cash can be counterfeit. PayPal sides with buyers. There is no enforcement mechanism for casual commerce — only hope.

This is the trust problem. It affects every marketplace app, every Craigslist deal, every Facebook Marketplace exchange. HandOff eliminates it.

---

## How It Works

HandOff uses a smart contract as the neutral third party. Neither side needs to trust the other — they only need to trust the code.

1. **Seller creates a deal** — specifies the amount, payout token (ETH, USDC, DAI, or WETH), and expiration window. A per-deal escrow contract deploys on Ethereum Sepolia via `HandOffFactory`.
2. **Seller shares the payment link** — `/pay/:dealId` is sent to the buyer over any channel.
3. **Buyer funds the escrow** — connects a wallet (or creates one with just an email). They can pay with any supported token; HandOff handles the swap atomically via Uniswap. A 4-digit unlock code is generated client-side and stored on-chain as `keccak256(code)`. The buyer holds the plaintext.
4. **Both parties meet in person** — the exchange happens.
5. **Buyer reveals the code** to the seller.
6. **Seller enters the code** at `/deal/:dealId`. The contract verifies the hash, releases funds to the seller's wallet, records the deal in the reputation registry, and mints a permanent `deal-{id}.hand-off.eth` ENS subname as an on-chain receipt.
7. **If the seller never shows** — the buyer claims a full refund after the deal expires. No permission needed.

---

## Why It Works

- **Buyer safety**: Funds are locked in the contract before any exchange. If the seller disappears, the buyer gets a full refund after expiry.
- **Seller safety**: Funds are confirmed on-chain before handing over anything. No chargebacks, no reversed transfers, no counterfeit risk.
- **Privacy**: Only a 4-digit alphanumeric code is exchanged in person. No personal data touches the blockchain.
- **Trustlessness**: No human operator can freeze, redirect, or reverse funds. The contract is the only authority.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart contracts | Solidity 0.8.26, OpenZeppelin 5.x |
| Contract tooling | Hardhat 2.x, Hardhat Ignition, TypeChain |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 3 |
| Ethereum client | viem 2.x, wagmi 2.x, TanStack Query 5.x |
| Routing | React Router 7.x |
| Wallet / auth | Dynamic.xyz JS SDK (`@dynamic-labs-sdk/client` + `@dynamic-labs-sdk/evm` v0.23.x) |
| Swap integration | Uniswap Trading API (server-proxied) + Universal Router 2.0 |
| ENS | viem `getEnsAddress` / `getEnsName`, `HandOffSubnameRegistrar.sol` |
| Deployment | Netlify (frontend + serverless functions) |

---

## Integrations

### Uniswap — Pay With Any Token

Sellers specify the token they want to receive. Buyers can pay with whatever they hold. HandOff handles the conversion transparently.

**How it works:**

1. `frontend/netlify/functions/uniswap.mts` is a Netlify serverless function that proxies all Uniswap Trading API requests. It injects `x-api-key` and `x-universal-router-version: 2.0` server-side. **The API key is never present in the client bundle.**
2. `frontend/src/lib/uniswap.ts` calls `/api/uniswap/quote`, `/api/uniswap/check_approval`, and `/api/uniswap/swap` through the proxy. Both CLASSIC routes and UniswapX (Dutch V2, Dutch V3, Priority) quote types are supported.
3. `HandOff.fundWithSwap()` receives the router calldata from the Trading API. It pulls the buyer's input token, calls Universal Router 2.0, verifies the output meets the required amount (`SlippageExceeded` revert otherwise), locks the payout token in escrow, revokes the router approval unconditionally, and refunds any unconsumed input — all in a single transaction. The swap and the escrow deposit are atomic: they succeed or revert together.

**Example flow:** Seller requests USDC → Buyer holds ETH → Trading API returns swap calldata → `fundWithSwap()` swaps ETH→USDC and deposits USDC into escrow in one transaction.

**Why it qualifies for the Uniswap prize track:** Live Trading API integration with real API key handling, server-proxied to protect credentials. Atomic on-chain execution via Universal Router 2.0. Novel application: Uniswap is the payment rail, not a DeFi feature.

**Relevant code:**
- `frontend/netlify/functions/uniswap.mts` — API proxy (server-side key injection)
- `frontend/src/lib/uniswap.ts` — quote/approval/swap client
- `frontend/src/hooks/useTokenSwap.ts` — React state management for quote + swap flow
- `contracts/contracts/HandOff.sol` — `fundWithSwap()` (line 258)

---

### ENS — Identity, Reputation & Deal Receipts

ENS is used at three distinct layers in HandOff. Not just name lookups.

**Layer 1 — Identity on every page**

Forward ENS resolution (`getEnsAddress`) on deal creation lets sellers enter a payout address as `alice.eth` instead of `0x1234...`. Reverse ENS resolution (`getEnsName`) via the `EnsName` component displays `.eth` names wherever a wallet address appears — deal pages, payment pages, history, profiles.

**Layer 2 — Reputation anchored to ENS identity**

`HandOffReputation.sol` is a singleton registry that tracks per-wallet: `sellerDealCount`, `sellerTotalVolume`, `sellerPositiveReviews`, `sellerTotalReviews`, `buyerDealCount`, `buyerPositiveReviews`, `buyerTotalReviews`. Every deal page displays these stats alongside the counterparty's ENS name. Reputation is stored on-chain by address and displayed via ENS — no centralized profile system.

**Layer 3 — Permanent deal receipts as ENS subnames**

On every completed deal, `HandOffSubnameRegistrar.sol` mints `deal-{id}.hand-off.eth` on Ethereum Sepolia. The subname resolves to the escrow contract address and carries structured text records:

| Text record key | Value |
|----------------|-------|
| `handoff-id` | Global deal ID |
| `escrow` | Escrow contract address |
| `seller` | Seller wallet address |
| `buyer` | Buyer wallet address |
| `amount` | Deal amount |
| `timestamp` | Completion timestamp (UNIX) |

These are permanent, human-readable, publicly verifiable transaction receipts. Look up any completed deal at [sepolia.app.ens.domains](https://sepolia.app.ens.domains).

**Why it qualifies for the ENS prize track:** ENS is used as identity layer (forward + reverse resolution across the full app), as a reputation anchor (stats displayed alongside ENS names), and as immutable receipt infrastructure (subname minting with structured text records on deal completion). The depth of integration across three layers — and the novel use case of ENS subnames as transaction receipts — goes well beyond name lookups.

**Relevant code:**
- `contracts/contracts/HandOffSubnameRegistrar.sol` — subname minting contract
- `contracts/ignition/modules/HandOffSubnameRegistrar.ts` — deployment config (ENS registry + resolver addresses, `namehash("hand-off.eth")`)
- `frontend/src/components/EnsName.tsx` — reverse resolution component
- `frontend/src/pages/CreateDeal.tsx` (line 56) — forward resolution on deal creation

---

### Dynamic — Embedded Wallets for Everyone

HandOff targets people who have never used a crypto wallet. Dynamic makes it possible for a buyer to onboard with just an email address.

**Integration details:**

The app uses the **framework-agnostic JavaScript SDK** (`@dynamic-labs-sdk/client` + `@dynamic-labs-sdk/evm`) — not the React-specific widget. Dynamic's state management runs outside React's render cycle; React components subscribe to it via a custom hook.

- `frontend/src/lib/dynamic.ts` — initializes `createDynamicClient()` with the EVM extension as a module-level side effect
- `frontend/src/hooks/useDynamicAuth.ts` — full auth lifecycle using raw JS SDK functions:
  - `sendEmailOTP()` + `verifyOTP()` for passwordless email onboarding
  - `createWaasWalletAccounts()` for embedded wallet creation (no external wallet required)
  - `connectAndVerifyWithWalletProvider()` for MetaMask, Rainbow, and other external wallets
  - `getAvailableWalletProvidersData()` to enumerate available providers at runtime
  - `onEvent('walletAccountsChanged')` for reactive auth state
- `frontend/src/hooks/useDynamicWrite.ts` — uses `createWalletClientForWalletAccount()` from `@dynamic-labs-sdk/evm/viem` to build a viem `WalletClient` for the active wallet. Handles chain switching via `switchActiveNetwork()` and `wallet_addEthereumChain` before every transaction.
- `frontend/src/lib/dynamic-wagmi-connector.ts` — custom wagmi connector that bridges Dynamic's account state into standard wagmi hooks (`useAccount`, `useReadContract`)

A buyer with only an email address can create an embedded wallet, fund an escrow, and receive a permanent ENS-backed transaction receipt — without ever installing MetaMask.

**Why it qualifies for the Dynamic prize track:** The framework-agnostic JS SDK is used throughout. The integration covers the full user lifecycle (email OTP → embedded wallet creation → transaction signing) and materially expands who can use the product — any email address, no existing crypto setup required.

**Relevant code:**
- `frontend/src/lib/dynamic.ts` — client initialization
- `frontend/src/hooks/useDynamicAuth.ts` — auth flow
- `frontend/src/hooks/useDynamicWrite.ts` — transaction signing via Dynamic wallet
- `frontend/src/lib/dynamic-wagmi-connector.ts` — wagmi bridge

---

## Smart Contracts

All contracts deployed on **Ethereum Sepolia** (chainId 11155111).

| Contract | Address |
|----------|---------|
| `HandOffReputation` | `0x6F27405a3b38952DF88aea5F1B7F5b546D7a328a` |
| `HandOffFactory` | `0xe6A1B57738eBc3EC39975B0aFcE321d962d3a429` |
| `HandOffSubnameRegistrar` | `0x8e9568CF2F4Aa172DCDc91d320d96B964255226B` |
| Uniswap Universal Router 2.0 | `0x492e6456d9528771018deb9e87ef7750ef184104` |
| ENS Registry | `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` |
| ENS Public Resolver (Sepolia) | `0x8FADE66B79cC9f707aB26799354482EB93a5B7dD` |

**Contract architecture:**

`HandOffFactory` is the canonical entry point for deal creation. It deploys a `HandOff` escrow and atomically registers it with `HandOffReputation` in a single transaction. `HandOffReputation` accepts writes only from registered escrow contracts — `HandOffFactory` holds the `AUTHORIZED_DEPLOYER` role after initial setup. `HandOffSubnameRegistrar` holds ownership of the `hand-off.eth` ENS name on Ethereum Sepolia and mints subnames on deal completion.

---

## Escrow Lifecycle

```
           createHandOff() via HandOffFactory
                        │
                  ┌─────▼──────┐
                  │  CREATED   │ ← seller can edit() or cancel()
                  └─────┬──────┘
         fund() ─────────┤─────── fundWithSwap() (Uniswap swap path)
                  ┌─────▼──────┐
                  │   FUNDED   │
                  └──┬─────┬───┘
             unlock()│     │refund() (only callable after expiry)
              ┌──────▼─┐ ┌─▼───────┐
              │COMPLETED│ │ EXPIRED │
              └────┬────┘ └─────────┘
                   │
          submitReview() available
          to both buyer and seller
```

| Transition | Who | Condition |
|-----------|-----|-----------|
| `CREATED → FUNDED` | Buyer | `fund()` or `fundWithSwap()` |
| `CREATED → CANCELED` | Seller | `cancel()` before funding |
| `FUNDED → COMPLETED` | Seller | `unlock()` with correct code, before expiry |
| `FUNDED → EXPIRED` | Buyer | `refund()` after `expirationTimestamp` |
| Any state | Either party | `submitReview()` after COMPLETED |

Minimum expiry window: 5 minutes (`MIN_EXPIRY_WINDOW`). Deals cannot be funded after expiry.

---

## Local Development

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| pnpm | ≥ 9 (`npm install -g pnpm`) |

### Setup

```bash
# Clone
git clone https://github.com/JPier34/Hand-Off.git
cd Hand-Off

# Install all workspace dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env — see table below

# Compile contracts
cd contracts && npm run compile && cd ..

# Run the frontend dev server
cd frontend && npm run dev
# → http://localhost:5173
```

### Environment Variables

Create `.env` at the project root. The Vite dev server proxies Uniswap API requests server-side during local development using the same `UNISWAP_API_KEY`.

| Variable | Description |
|----------|-------------|
| `ALCHEMY_API_KEY` | Alchemy API key — used by Hardhat for RPC access during contract deployment |
| `PRIVATE_KEY` | Deployer wallet private key for testnet deployments — never commit this |
| `ETHERSCAN_API_KEY` | Etherscan API key for contract verification on Sepolia |
| `UNISWAP_API_KEY` | Uniswap Trading API key — injected server-side by Netlify Function and Vite proxy; never sent to the browser |
| `VITE_DYNAMIC_ENVIRONMENT_ID` | Dynamic.xyz environment ID, exposed to the Vite browser build |
| `DYNAMIC_ENVIRONMENT_ID` | Same value as above — used by Netlify Functions at runtime |

### Mock Mode

Set `MOCK=true` in your environment to run without any wallet or RPC calls. All contract interactions are simulated in-memory. Useful for frontend development without testnet ETH.

---

## Deployment

### Frontend (Netlify)

`netlify.toml` at the project root configures everything:

```toml
[build]
  command = "npm run build"
  publish = "frontend/dist"
  functions = "frontend/netlify/functions"
```

Set these environment variables in the Netlify dashboard before deploying:

- `UNISWAP_API_KEY`
- `DYNAMIC_ENVIRONMENT_ID`
- `VITE_DYNAMIC_ENVIRONMENT_ID`

### Smart Contracts

```bash
cd contracts

# Deploy HandOffReputation + HandOffFactory
# (factory automatically takes AUTHORIZED_DEPLOYER role from deployer EOA)
npx hardhat ignition deploy ignition/modules/HandOffFactory.ts --network ethSepolia

# Deploy HandOffSubnameRegistrar on Eth Sepolia
# (requires hand-off.eth ownership — contact team for ENS setup)
npx hardhat ignition deploy ignition/modules/HandOffSubnameRegistrar.ts --network ethSepolia
```

---

## Project Structure

```
Hand-Off/
├── .env                        ← environment variables (gitignored)
├── netlify.toml                ← Netlify build + functions config
├── contracts/                  ← Hardhat workspace
│   ├── contracts/
│   │   ├── HandOff.sol         ← per-deal escrow (state machine, fund/unlock/refund)
│   │   ├── HandOffFactory.sol  ← deploys + registers escrows atomically
│   │   ├── HandOffReputation.sol ← singleton reputation registry
│   │   └── HandOffSubnameRegistrar.sol ← mints deal-{id}.hand-off.eth
│   ├── ignition/modules/       ← Hardhat Ignition deploy scripts
│   ├── test/                   ← Hardhat tests (TypeScript)
│   └── hardhat.config.ts
└── frontend/                   ← Vite + React workspace
    ├── netlify/functions/
    │   └── uniswap.mts         ← Netlify Function: Uniswap API proxy
    └── src/
        ├── pages/              ← Route-level components (Home, CreateDeal, BuyerPay, ManageDeal, History)
        ├── components/         ← Reusable UI (EnsName, WrongNetworkBanner, Layout, ...)
        ├── hooks/              ← Custom hooks (useDynamicAuth, useDynamicWrite, useEscrow, useReputation, useTokenSwap, ...)
        ├── lib/                ← Pure utilities (constants, tokens, uniswap, ens, errors, dynamic, ...)
        └── contracts/          ← ABIs + deployed addresses
```

---

## Hackathon Prize Tracks

### ENS Prize Track

**What we built:** Three integrated ENS layers — identity resolution across all address inputs and displays, a reputation system anchored to ENS identities, and immutable deal receipts as `deal-{id}.hand-off.eth` ENS subnames with structured text records.

**Why it qualifies:**
- **Forward resolution** (`getEnsAddress` via viem) on deal creation: sellers enter payout addresses as `.eth` names
- **Reverse resolution** (`getEnsName` via `EnsName` component) on all deal, payment, and profile pages: wallet addresses are displayed as `.eth` names where available
- **On-chain reputation** (`HandOffReputation.sol`): per-wallet deal count, volume, and review scores displayed alongside ENS identities — address-based storage with ENS as the display layer
- **Subname deal receipts** (`HandOffSubnameRegistrar.sol`): every completed deal mints `deal-{id}.hand-off.eth`, resolves to the escrow contract, and stores `buyer`, `seller`, `escrow`, `amount`, `timestamp` as text records — permanently verifiable at `sepolia.app.ens.domains`
- The `hand-off.eth` parent domain is owned and controlled by the HandOffSubnameRegistrar contract on Eth Sepolia

**Where to find it:** `contracts/contracts/HandOffSubnameRegistrar.sol`, `contracts/ignition/modules/HandOffSubnameRegistrar.ts`, `frontend/src/components/EnsName.tsx`, `frontend/src/pages/CreateDeal.tsx:56`

---

### Uniswap Prize Track

**What we built:** Atomic token-swap-and-deposit in a single transaction, powered by the Uniswap Trading API routed through a Netlify serverless proxy that keeps the API key off the client.

**Why it qualifies:**
- Real Uniswap Trading API integration — `quote`, `check_approval`, and `swap` endpoints
- API key protected server-side via Netlify Function; the key is never in the browser bundle or visible in network requests from the client
- Universal Router 2.0 calldata executed atomically inside `fundWithSwap()`: swap + escrow deposit succeed or revert together
- Supports both CLASSIC routing and UniswapX (Dutch V2/V3, Priority) quote responses
- On-chain slippage enforcement: `SlippageExceeded` custom error if received < required amount
- Fee-on-transfer safe: approval uses `actualInput` (post-transfer balance delta), not `_inputAmount`
- Router approval revoked unconditionally after every swap (`forceApprove(router, 0)`)

**Where to find it:** `frontend/netlify/functions/uniswap.mts`, `frontend/src/lib/uniswap.ts`, `frontend/src/hooks/useTokenSwap.ts`, `contracts/contracts/HandOff.sol` (`fundWithSwap`, line 258)

---

### Dynamic Prize Track

**What we built:** Full embedded wallet onboarding using the Dynamic framework-agnostic JavaScript SDK — email OTP → embedded wallet creation → on-chain transaction signing, no MetaMask required.

**Why it qualifies:**
- Uses `@dynamic-labs-sdk/client` and `@dynamic-labs-sdk/evm` — the framework-agnostic JS SDK, not the React widget
- Complete auth lifecycle implemented via raw SDK functions: `sendEmailOTP`, `verifyOTP`, `createWaasWalletAccounts`, `connectAndVerifyWithWalletProvider`, `getAvailableWalletProvidersData`, `onEvent`, `waitForClientInitialized`
- `createWalletClientForWalletAccount()` from `@dynamic-labs-sdk/evm/viem` builds a viem WalletClient for each connected account — transactions route through the correct wallet extension
- Custom wagmi connector bridges Dynamic account state into standard wagmi hooks without the DynamicContextProvider wrapper
- The entire transaction-signing pipeline (`useDynamicWrite.ts`) bypasses wagmi's write hooks and uses the Dynamic wallet client directly — enabling embedded wallet users to sign transactions identically to MetaMask users

**Where to find it:** `frontend/src/lib/dynamic.ts`, `frontend/src/hooks/useDynamicAuth.ts`, `frontend/src/hooks/useDynamicWrite.ts`, `frontend/src/lib/dynamic-wagmi-connector.ts`

---

## License

MIT
