# HandOff

HandOff is a trustless escrow app for in-person C2C transactions. Buyers fund an escrow, receive an unlock code, and the seller completes the exchange in person to release funds.

Built at ETHGlobal Cannes 2026 with ENS, Uniswap, and Dynamic.xyz integrations.

## Monorepo Structure

```text
.
|- contracts/   Hardhat workspace for Solidity contracts, tests, and deploys
|- frontend/    Vite + React application
|- .env.example Environment template
`- pnpm-workspace.yaml
```

## Prerequisites

- Node.js 20+
- pnpm 9+

## Setup

```bash
pnpm install
cp .env.example .env
pnpm compile
pnpm dev
```

## Useful Commands

```bash
pnpm compile
pnpm test:contracts
pnpm dev
pnpm build
pnpm typecheck
```

## Environment

Copy `.env.example` to `.env` and fill in the required RPC keys, wallet credentials, and deployed contract addresses.

## License

MIT
