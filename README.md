# HandOff 🤝

**HandOff** is a trustless, peer-to-peer escrow application built for in-person C2C transactions. Sellers deploy a per-deal smart contract and share a payment link; buyers fund it (with optional token swap via Uniswap) and receive a 4-digit unlock code; the seller enters the code in person to release funds — no middleman, no trust required.

> Built at **ETHGlobal Cannes 2026** · Sponsor tracks: ENS · Uniswap · Dynamic.xyz

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          HandOff Monorepo                               │
│                                                                         │
│  contracts/                          frontend/                          │
│  ├── HandOff.sol          ◄──────────── useEscrowWrite.ts               │
│  │   (per-deal escrow)                 useEscrow.ts                     │
│  │   fund() fundWithSwap()             useTokenSwap.ts                  │
│  │   unlock() refund()                                                  │
│  │       │                                                              │
│  ├── HandOffFactory.sol   ◄──────────── useCreateDeal (factory entry)   │
│  │   (atomic deploy+register)                                           │
│  │       │                                                              │
│  ├── HandOffReputation.sol ◄────────── useReputation.ts                 │
│  │   (address reputation registry)                                      │
│  │       │                                                              │
│  └── HandOffSubnameRegistrar.sol       useEscrowWrite (unlock trigger)  │
│      (deal-{id}.hand-off.eth)          EnsName.tsx (reverse resolution) │
│                                                                         │
│  External Integrations:                                                 │
│  ┌──────────────┐  ┌───────────────────────┐  ┌──────────────────────┐ │
│  │ ENS Registry │  │ Uniswap Trading API   │  │ Dynamic.xyz JS SDK   │ │
│  │ (ETH Sepolia)│  │ (server-proxied key)  │  │ (@dynamic-labs-sdk/  │ │
│  └──────────────┘  └───────────────────────┘  │  client)             │ │
│                                               └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

Deal Lifecycle:
  Seller creates HandOff via factory → shares /pay/:dealId link
      ↓
  Buyer connects wallet → funds escrow (ETH direct or token swap via Uniswap)
      ↓
  Contract stores keccak256(unlockCode) on-chain; buyer sees plaintext code
      ↓
  In-person: Seller enters code → contract verifies → releases funds
      ↓
  HandOffReputation records completion · HandOffSubnameRegistrar mints
  deal-{id}.hand-off.eth subname as permanent on-chain receipt
```

---

## Deployed Contracts (ETH Sepolia — chainId 11155111)

| Contract | Address |
|----------|---------|
| `HandOffReputation` | `0x6F27405a3b38952DF88aea5F1B7F5b546D7a328a` |
| `HandOffFactory` | `0xe6A1B57738eBc3EC39975B0aFcE321d962d3a429` |
| `HandOffSubnameRegistrar` | `0x8e9568CF2F4Aa172DCDc91d320d96B964255226B` |

Router: Uniswap Universal Router 2.0 at `0x492e6456d9528771018deb9e87ef7750ef184104` (ETH Sepolia)

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 20.0.0 | Use [nvm](https://github.com/nvm-sh/nvm) |
| pnpm | ≥ 9.0.0 | `npm install -g pnpm` |
| Wallet | any | Testnet ETH on ETH Sepolia |

---

## Environment Variables

Copy `frontend/.env.example` → `frontend/.env` and fill in every value before running.

| Variable | Description | Where to get it |
|----------|-------------|----------------|
| `ALCHEMY_API_KEY` | RPC provider for contract deployment | [dashboard.alchemy.com](https://dashboard.alchemy.com) |
| `UNISWAP_API_KEY` | Uniswap Trading API key — added server-side, never in client bundle | [developer.uniswap.org](https://developer.uniswap.org) |
| `DYNAMIC_ENVIRONMENT_ID` | Dynamic.xyz embedded wallet environment ID | [app.dynamic.xyz](https://app.dynamic.xyz) → Developers |
| `PRIVATE_KEY` | Deployer wallet private key (testnet only) | Your MetaMask |
| `VITE_DYNAMIC_ENVIRONMENT_ID` | Same as above, exposed to Vite browser build | Same as `DYNAMIC_ENVIRONMENT_ID` |
| `VITE_SUBNAME_ADDRESS` | Deployed `HandOffSubnameRegistrar` address | Already set: `0x8e9568CF2F4Aa172DCDc91d320d96B964255226B` |

---

## Setup

```bash
# 1. Clone
git clone https://github.com/<your-org>/hand-off.git
cd hand-off

# 2. Install all workspace dependencies
pnpm install

# 3. Configure environment
cp frontend/.env.example frontend/.env
# → Edit frontend/.env with your API keys

# 4. Compile Solidity contracts
cd contracts && npm run compile

# 5. Run the frontend dev server
cd ../frontend && npm run dev
# → http://localhost:5173
```

---

## Sponsor Integrations

### Uniswap — Trading API + Atomic Swap at Deposit

Buyers don't need to hold the exact token a seller requires. HandOff integrates the **Uniswap Trading API** (not SwapRouter directly) to fetch optimal swap routes and execute them atomically.

**How it works:**
1. `frontend/netlify/functions/uniswap.mts` proxies all Uniswap API requests server-side, injecting `x-api-key` and `x-universal-router-version: 2.0` headers. The API key is **never present in the client bundle**.
2. `frontend/src/lib/uniswap.ts` calls `/api/uniswap/quote`, `/api/uniswap/check_approval`, and `/api/uniswap/swap` — all routed through the proxy.
3. `HandOff.sol → fundWithSwap()` accepts the swap calldata from the Trading API and executes the swap via Universal Router 2.0 (`0x492e6456d9528771018deb9e87ef7750ef184104`) in the same transaction that locks funds in escrow. The swap and the escrow deposit are **atomic** — they succeed or revert together.

**Example flow:** Seller requests USDC → Buyer holds ETH → Trading API returns swap calldata → `fundWithSwap()` swaps ETH→USDC and deposits USDC into escrow in one transaction.

See [UNISWAP_INTEGRATION.md](./UNISWAP_INTEGRATION.md) for architecture details and live transaction proof.

### ENS — Identity, Reputation & Deal Receipts

HandOff uses ENS at three layers:

1. **Resolution on all address fields** — Forward ENS resolution (name→address) via viem's `getEnsAddress` is implemented on `/create`. Reverse ENS resolution (address→name) via the `EnsName` component is shown on all deal pages wherever a wallet address is displayed.

2. **Reputation registry** — `HandOffReputation.sol` (ETH Sepolia) tracks `dealCount`, `totalVolume`, and reviews per wallet address. The reputation UI displays these stats alongside the wallet's ENS name where available (address-based storage with ENS display layer on top).

3. **Subname deal receipts** — On every completed deal, `HandOffSubnameRegistrar.sol` mints `deal-{id}.hand-off.eth` on ETH Sepolia with text records: `buyer`, `seller`, `escrow`, `amount`, `timestamp`, `handoff-id`. These are permanent, human-readable on-chain receipts verifiable at [sepolia.app.ens.domains](https://sepolia.app.ens.domains).

### Dynamic.xyz — JavaScript SDK + Embedded Wallets

HandOff uses the **framework-agnostic JavaScript SDK** (`@dynamic-labs-sdk/client` + `@dynamic-labs-sdk/evm`) — not the legacy React-specific SDK. This qualifies for the Dynamic JS SDK prize track.

**Integration highlights:**
- `frontend/src/lib/dynamic.ts` — initializes `createDynamicClient()` with the environment ID
- `frontend/src/hooks/useDynamicAuth.ts` — full auth flow using raw JS SDK calls: `sendEmailOTP()`, `verifyOTP()`, `createWaasWalletAccounts()` (embedded wallet creation), `connectAndVerifyWithWalletProvider()` (MetaMask / external wallets)
- `frontend/src/hooks/useDynamicWrite.ts` — bridges Dynamic wallet accounts into wagmi using `createWalletClientForWalletAccount()` from `@dynamic-labs-sdk/evm/viem`
- Email OTP → embedded wallet → transaction signing flow works end-to-end without MetaMask

---

## Project Structure

```
hand-off/
├── contracts/             ← Hardhat workspace (Solidity + TypeChain)
│   ├── contracts/         ← .sol source files
│   ├── ignition/          ← Hardhat Ignition deploy modules
│   └── test/              ← Hardhat tests (148 passing)
└── frontend/              ← Vite + React workspace
    ├── netlify/functions/ ← Server-side Netlify Functions (Uniswap API proxy)
    └── src/
        ├── pages/         ← Route-level page components
        ├── components/    ← Reusable UI components
        ├── hooks/         ← wagmi v2 custom hooks
        ├── lib/           ← Pure utility functions
        └── contracts/     ← ABIs + chain addresses
```

---

## Team

| Name | Role | GitHub |
|------|------|--------|
| TBD  | Smart Contracts | @tbd |
| TBD  | Frontend | @tbd |
| TBD  | Design / UX | @tbd |

---

## License

MIT
