# wagmi-escrow-starter

React + Vite + TypeScript + Tailwind CSS + Wagmi v2 + RainbowKit starter for EVM escrow dApps.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v3 |
| Web3 | Wagmi v2 + viem v2 |
| Wallet UI | RainbowKit v2 |
| Routing | React Router v6 |
| Chain | Base Sepolia (configurable) |
| Deploy | Render |

## What's included

```
src/
├── components/ui/      Button, Card, Input, StatusBadge, Spinner
├── components/escrow/  CodeDisplay, CountdownTimer
├── hooks/              useEscrow.ts (read), useEscrowWrite.ts (write + wait for receipt)
├── lib/                types.ts, constants.ts, code-gen.ts
└── pages/              CreateDeal, BuyerPay, ManageDeal — full layout shells
```

All wagmi states handled out of the box: `isPending` → `isConfirming` → `isSuccess` / `isError`.

## Setup

```bash
npm install
cp .env.example .env   # fill in your keys
npm run dev
```

## Environment variables

```
VITE_WALLETCONNECT_PROJECT_ID=   # free at cloud.walletconnect.com
VITE_FACTORY_ADDRESS=            # your deployed contract address
VITE_CHAIN_ID=84532              # 84532 = Base Sepolia
```

## Plug in your contract

1. Replace the ABI placeholder in `src/lib/constants.ts` with your Hardhat export
2. Set `VITE_FACTORY_ADDRESS` in `.env`
3. Adjust the `getDetails()` return type in `src/hooks/useEscrow.ts` to match your contract

## Commands

```bash
npm run dev          # dev server
npm run build        # production build
npx tsc --noEmit     # type check
```
