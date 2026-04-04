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
│  ├── HandOff.sol          ◄──────────── useHandOffDeploy.ts             │
│  │   (per-deal escrow)                 useHandOffFund.ts                │
│  │   fund() unlock() refund()          useHandOffUnlock.ts              │
│  │       │                                                              │
│  ├── HandOffReputation.sol ◄────────── useReputation.ts                 │
│  │   (singleton registry)              Profile.tsx                      │
│  │       │                                                              │
│  └── HandOffSubnameRegistrar.sol       lib/ens.ts                       │
│      (deal-{id}.hand-off.eth)          EnsInput.tsx                     │
│                                                                         │
│  External Integrations:                                                 │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────┐     │
│  │ ENS Registry │  │ Uniswap API   │  │ Dynamic.xyz SDK          │     │
│  │ (Eth Sepolia)│  │ (swap quotes) │  │ (embedded wallets)       │     │
│  └──────────────┘  └───────────────┘  └──────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘

Deal Lifecycle:
  Seller deploys HandOff.sol → shares /fund/:address link
      ↓
  Buyer connects wallet → funds escrow (± Uniswap swap)
      ↓
  Contract stores keccak256(code) on-chain; buyer sees plaintext code
      ↓
  In-person: Seller enters code → contract verifies → releases funds
      ↓
  HandOffReputation records completion · HandOffSubnameRegistrar mints
  deal-{id}.hand-off.eth subname as permanent on-chain receipt
```

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 20.0.0 | Use [nvm](https://github.com/nvm-sh/nvm) |
| pnpm | ≥ 9.0.0 | `npm install -g pnpm` |
| Wallet | any | Testnet ETH on Base Sepolia + Eth Sepolia |

---

## Environment Variables

Copy `.env.example` → `.env` and fill in every value before running.

| Variable | Description | Where to get it |
|----------|-------------|----------------|
| `ALCHEMY_API_KEY` | RPC provider for contract deployment | [dashboard.alchemy.com](https://dashboard.alchemy.com) |
| `UNISWAP_API_KEY` | Uniswap Routing API for swap quotes | [developer.uniswap.org](https://developer.uniswap.org) |
| `DYNAMIC_ENVIRONMENT_ID` | Dynamic.xyz embedded wallet env | [app.dynamic.xyz](https://app.dynamic.xyz) → Developers |
| `WALLETCONNECT_PROJECT_ID` | WalletConnect QR bridge | [cloud.walletconnect.com](https://cloud.walletconnect.com) |
| `PRIVATE_KEY` | Deployer wallet private key (testnet only!) | Your MetaMask / hardware wallet |
| `VITE_REPUTATION_CONTRACT_ADDRESS` | Deployed `HandOffReputation` address | Set after running deploy |
| `VITE_SUBNAME_REGISTRAR_ADDRESS` | Deployed `HandOffSubnameRegistrar` address | Set after running deploy |
| `VITE_ALCHEMY_API_KEY` | Same key as above, exposed to browser | Same as `ALCHEMY_API_KEY` |
| `UNISWAP_API_KEY` | Same key as above, exposed to browser | Same as `UNISWAP_API_KEY` |
| `DYNAMIC_ENVIRONMENT_ID` | Same as above, exposed to browser | Same as `DYNAMIC_ENVIRONMENT_ID` |
| `WALLETCONNECT_PROJECT_ID` | Same as above, exposed to browser | Same as `WALLETCONNECT_PROJECT_ID` |

---

## Setup

```bash
# 1. Clone
git clone https://github.com/<your-org>/hand-off.git
cd hand-off

# 2. Install all workspace dependencies
pnpm install

# 3. Configure environment
cp .env.example .env
# → Edit .env with your real API keys and private key

# 4. Compile Solidity contracts
pnpm compile
# Output: contracts/artifacts/ and contracts/typechain-types/

# 5. Deploy contracts to Eth Sepolia (ENS subname registrar)
pnpm --filter contracts exec npx hardhat ignition deploy ignition/modules/HandOffSubnameRegistrar.ts --network ethSepolia

# 6. Deploy contracts to Base Sepolia (reputation registry)
pnpm --filter contracts exec npx hardhat ignition deploy ignition/modules/HandOffReputation.ts --network baseSepolia

# 7. Update .env with deployed addresses
# VITE_REPUTATION_CONTRACT_ADDRESS=0x...
# VITE_SUBNAME_REGISTRAR_ADDRESS=0x...

# 8. Run the frontend dev server
pnpm dev
# → http://localhost:5173
```

---

## Sponsor Integrations

### ENS — Identity, Reputation & Deal Receipts
HandOff uses ENS at three layers. First, users can enter `.eth` names on any input field — the `EnsInput` component resolves them live via viem's `getEnsAddress`. Second, the `HandOffReputation` singleton tracks `dealCount` and `totalVolume` per address, and the `Profile` page displays these stats alongside the user's ENS name and avatar. Third, on every completed deal `HandOffSubnameRegistrar.sol` mints a `deal-{id}.hand-off.eth` subname on Eth Sepolia and stores text records (buyer, seller ENS, amount, timestamp) — creating a permanent, human-readable, on-chain receipt for every transaction.

### Uniswap — Token Swap at Deposit
Buyers don't need to hold the exact token a seller requires. The `FundDeal` page integrates `SwapPreview` — powered by `useUniswapQuote` and `lib/uniswap.ts` — to fetch a live Uniswap quote for any ERC-20 → required token swap. The `fundWithSwap()` function on `HandOff.sol` accepts the swap path and executes it atomically: the swap and the escrow deposit happen in a single transaction on Base Sepolia, reducing friction for the buyer without requiring seller changes.

### Dynamic.xyz — Embedded Wallets
HandOff targets non-crypto-native users buying and selling in person. Dynamic.xyz provides a seamless embedded wallet experience: buyers can sign up with email or social login, receive a smart account, and fund escrow without ever touching MetaMask. The `WalletButton` component wraps `<DynamicWidget />`, and the provider hierarchy in `main.tsx` (`DynamicContextProvider → WagmiProvider → QueryClientProvider → DynamicWagmiConnector`) is the exact order required by the Dynamic SDK to bridge its embedded accounts into wagmi's standard hook surface.

---

## Project Structure

```
hand-off/
├── contracts/             ← Hardhat workspace (Solidity + TypeChain)
│   ├── contracts/         ← .sol source files
│   ├── ignition/          ← Hardhat Ignition deploy modules
│   └── test/              ← Hardhat tests (TypeScript)
└── frontend/              ← Vite + React workspace
    └── src/
        ├── pages/         ← Route-level page components
        ├── components/    ← Reusable UI components
        ├── hooks/         ← Wagmi v2 custom hooks
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