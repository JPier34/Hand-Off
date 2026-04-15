# HandOff — Guida per Claude Code

## Contesto del Progetto

HandOff è un'app di escrow trustless P2P per transazioni C2C in persona (ETH Global Cannes 2026).
Monorepo: contratti Solidity (Hardhat) + frontend React (Vite).

**Branch attivo:** `test-jpier` → merge su `main` solo quando una fase è stabile e testata.
**Non pushare mai su `main` direttamente.**

---

## Filosofia di Lavoro

### Regole Fondamentali

1. **Nessun dato hardcoded di test nel codice di produzione.**
   Niente deal ID falsi (42, 35, ecc.), niente indirizzi wallet fake, niente array di mock dati
   esposti all'utente finale. `MOCK_MODE` (guidato da `VITE_MOCK=true`) è accettabile solo come
   flag di sviluppo, mai come logica visibile in produzione.

2. **Implementazioni funzionanti, non placeholder.**
   Se una feature non è pronta, la pagina mostra uno stato di caricamento o errore reale.
   Non si creano "stub" che fingono funzionalità.

3. **Un passo alla volta, test prima di integrare.**
   Ogni feature viene implementata, verificata end-to-end, poi si passa alla successiva.
   Non si aggiunge complessità su codice non verificato.

4. **Non riscrivere ciò che funziona.**
   Le implementazioni reali (useEscrowWrite, useDealDetails, useReputation) sono complete.
   Si costruisce sopra, non si rimpiazza.

5. **Riusa prima di creare.**
   Cercare sempre hook/utility esistenti prima di scriverne di nuovi.
   `useEscrowWrite.ts` contiene già tutta la logica di scrittura contratto.
   `useEscrow.ts` contiene già tutta la logica di lettura.

6. **Sicurezza prima dell'ergonomia.**
   Nessuna API key nel bundle browser in produzione.
   Nessun indirizzo zero raggiungibile dall'utente senza warning esplicito.

### Stile di Codice

- TypeScript strict, no `any` espliciti senza commento
- React hooks solo in componenti/hook (no hook in utility pure)
- Viem per tutto ciò che riguarda la chain (non ethers.js)
- Tailwind CSS con classi `hoff-*` definite nel theme

---

## Stack Tecnico

| Layer | Tecnologia |
|-------|-----------|
| Contratti | Solidity 0.8.26, OpenZeppelin 5, Hardhat + Ignition |
| Frontend | React 19, Vite 8, TypeScript 5.9 |
| Web3 reads | wagmi 2 + viem 2 |
| Web3 writes | Dynamic.xyz SDK (useDynamicWriteContract) |
| Wallet auth | Dynamic.xyz embedded wallets |
| Styling | Tailwind CSS 3 con theme custom |
| Chain target | Ethereum Sepolia (11155111) — mainnet futuro |
| ENS | Mainnet per risoluzione, Eth Sepolia per subname minting |
| Test contratti | Hardhat + Chai (148 test) |
| Test frontend | Vitest (unit) + Playwright (E2E in MOCK_MODE) |

---

## Architettura Contratti (Eth Sepolia)

```
HandOffReputation  0x8fe5A9F3949054Ca9A9f2f3378517180226D9222
HandOffFactory     0x34C44393b0E6704cbd908249E1b05e84D986C642
SubnameRegistrar   0xaE1cEb6058BC0118080ACb9b6bd96Ba2463B96E5
Uniswap Router 2.0 0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD
```

**Flusso deal:**
1. Seller → `Factory.createHandOff()` → deploy HandOff + registrazione Reputation
2. Buyer → `HandOff.fund()` o `fundWithSwap()` con unlock code hash
3. Seller → `HandOff.unlock(code)` → fondi a seller + mint `deal-{id}.hand-off.eth`

**Swap path — vincoli importanti:**
- `fundWithSwap` funziona solo per escrow ERC-20 (payoutToken ≠ address(0))
- Per escrow ETH il buyer deve sempre usare `fund()` — il `TokenSelector` viene nascosto
- Scenario swap testato e funzionante: USDC → WETH (escrow WETH)
- `tokenOut` nella quote usa il `payoutToken` reale del deal, non WETH hardcoded

---

## Roadmap

### ✅ FASE 0 — Workflow Netlify
- netlify.toml: branch deploy context, base directory, Uniswap CORS redirect
- Vite dev server proxy per `/api/uniswap`

### ✅ FASE 1 — Bug Fix Critici
- 1.1 Uniswap CORS proxy
- 1.2 Chain ID connector (baseSepolia → sepolia)
- 1.3 Token addresses (Base → Eth Sepolia) in useTokenPrice + mock.ts + History.tsx
- 1.4 Env var names canonicalizzati
- 1.5 IHandOffEscrow validation in SubnameRegistrar.sol
- 1.6 VolumeCapReached event in Reputation.sol
- 1.7 UI confirm per payout address ENS in CreateDeal.tsx
- **🧪 148/148 test Hardhat passati**

### ✅ FASE 2 — Feature Complete
- 2.0  Rimozione mock data hardcoded (Home.tsx, mock.ts, History.tsx, BuyerPay.tsx, ManageDeal.tsx)
- 2.1  `lib/ens.ts` — utility ENS completa (resolveEnsName, resolveEnsAddress, computeDealSubname, dealSubnameUrl, shortAddress)
- 2.2  `components/EnsInput.tsx` — input controllato con risoluzione .eth live + conferma indirizzo
- 2.3  `hooks/useUniswapQuote.ts` — re-export da useTokenSwap
- 2.4  `components/SwapPreview.tsx` — UI quote + slippage picker
- 2.5  `pages/FundDeal.tsx` / `pages/UnlockDeal.tsx` — superseduti da BuyerPay.tsx / ManageDeal.tsx (già completi)
- **Swap bug fix:** tokenOut usa payoutToken reale; TokenSelector nascosto per ETH escrows; isSwapPath corretto per payout ERC-20
- **🧪 tsc: 0 errori — build produzione OK**

### ✅ FASE 2b — ENS Deep Integration
- 2b.1  `components/DealReceiptBadge.tsx` — badge `deal-{id}.hand-off.eth` in BuyerPay (funded) + ManageDeal (completed)
- 2b.2  `EnsName.tsx` refactored — usa `resolveEnsAddress` da `lib/ens.ts`; prop `hint` per nome ENS on-chain (evita RPC call se già disponibile)
- 2b.3  Reputation display — `sellerEns` on-chain passato come `hint` in ViewEscrowView (ManageDeal) e seller card (BuyerPay)

### 🟡 FASE 3 — Hardening & CI/CD
- ✅ 3.1  GitHub Actions CI — contracts + unit (Vitest) + E2E (Playwright) su push a `test-jpier`, `main`, `master` e su ogni PR
- ✅ 3.x  `lib/ensFallback.ts` — parsing eventi `SubnameMintFailed` / `SubnameMintRequested` per retry frontend ENS mint
- ✅ 3.x  Gas estimation esplicita in `useDynamicWrite` (evita cap rejection MetaMask)
- ✅ 3.2  `waitForTransactionReceipt` sostituisce receipt poller manuale (`useReceiptPoller` + `receiptPollerLogic.ts`)
- ✅ 3.5  Slippage configurabile via UI — picker 0.1/0.5/1.0% in BuyerPay + SwapPreview; propagato a Uniswap Trading API
- ✅ 3.x  Fix lint P0/P1 — rules-of-hooks (BuyerPay, ManageDeal), no-unused-vars, react-refresh, vite.config dedup
- ✅ 3.3  Slither audit contratti — 0 finding su 90 detector (pre e post proxy refactor)
- ✅ 3.4  Netlify Function proxy per API key — `netlify/functions/uniswap.js` inietta `UNISWAP_API_KEY` server-side; `VITE_UNISWAP_API_KEY` mai nel bundle
- ✅ 3.6  Zod validation su risposte Uniswap Trading API — già implementata in `lib/uniswap.ts`

### ✅ FASE 3.x — EIP-1167 Minimal Proxy (HandOff)
- HandOff usa `Clones.clone() + initialize()` — gas `createHandOff` da 1.9M → 405k (-79%)
- `HandOff.sol`: `Initializable` OZ, `constructor()` chiama `_disableInitializers()`, campi ex-`immutable` → storage
- `HandOffFactory.sol`: deploya implementation nel costruttore, `createHandOff` clona + inizializza
- Test: `deployHandOffClone()` helper + `ClonesHelper.sol` — 154/154 test passati
- Slither: 0 finding post-refactor

### 🟢 FASE 4 — Deploy Mainnet
- [ ] 4.1  Ownership `hand-off.eth` ENS mainnet — dal wallet owner di `hand-off.eth` su mainnet, chiamare ENS Registry (`0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`):
        - Option A (consigliato): `setApprovalForAll(SubnameRegistrar_mainnet, true)`
        - Option B: `setOwner(namehash("hand-off.eth"), SubnameRegistrar_mainnet)`
        - *Già eseguito su Eth Sepolia il 2026-04-15*
- [ ] 4.2  Deploy contratti: Reputation → SubnameRegistrar → Factory
- [ ] 4.3  Verifica Etherscan + ABI publish
- [ ] 4.4  `addresses.ts` entry mainnet
- [ ] 4.5  Token addresses mainnet (USDC, WETH)
- [ ] 4.6  `VITE_NETWORK` per chain switching

---

## File Critici

| File | Ruolo |
|------|-------|
| `frontend/src/lib/constants.ts` | Indirizzi contratti + ABI exports |
| `frontend/src/contracts/addresses.ts` | Indirizzi per chain ID |
| `frontend/src/hooks/useEscrowWrite.ts` | Tutte le write al contratto |
| `frontend/src/hooks/useEscrow.ts` | Lettura stato deal on-chain |
| `frontend/src/hooks/useDynamicWrite.ts` | Wrapper Dynamic SDK per tx (con gas estimation) |
| `frontend/src/hooks/useTokenSwap.ts` | Quote Uniswap + fundWithSwap logic |
| `frontend/src/lib/ens.ts` | Utility ENS: forward/reverse resolution + deal subname helpers |
| `frontend/src/lib/ensFallback.ts` | Parsing SubnameMintFailed/Requested per retry ENS mint |
| `frontend/src/lib/tokens.ts` | Token Eth Sepolia (USDC, WETH, ETH) |
| `frontend/src/lib/mock.ts` | MOCK_MODE flag + runtime state per dev/test |
| `frontend/src/components/EnsName.tsx` | Display ENS name con hint on-chain + reverse resolution |
| `frontend/src/components/EnsInput.tsx` | Input .eth con risoluzione live |
| `frontend/src/components/DealReceiptBadge.tsx` | Badge deal-{id}.hand-off.eth nelle schermate di completamento |
| `frontend/src/components/SwapPreview.tsx` | Preview quote Uniswap con slippage |
| `contracts/contracts/HandOff.sol` | Contratto escrow per-deal |
| `contracts/contracts/HandOffFactory.sol` | Factory per deploy + registrazione |
| `contracts/contracts/HandOffReputation.sol` | Registry reputazione singleton |
| `contracts/contracts/HandOffSubnameRegistrar.sol` | ENS subname minting |

---

## Comandi Utili

```bash
# Test contratti (dalla root)
pnpm --filter contracts test

# Dev frontend
pnpm --filter frontend dev

# Build produzione
pnpm --filter frontend build

# Typecheck
pnpm --filter frontend typecheck

# Test unitari (Vitest)
pnpm test:unit

# Test E2E (Playwright, richiede VITE_MOCK=true — gestito automaticamente)
pnpm test:e2e

# Tutti i test in sequenza
pnpm test:contracts && pnpm test:unit && pnpm test:e2e
```

---

## Note ENS

- **Risoluzione nomi** (name → address): sempre su **mainnet** via public RPC (`publicnode.com`)
- **Reverse resolution** (address → name): mainnet, con cache in-memory per sessione
- **Subname minting** (`deal-{id}.hand-off.eth`): su **Eth Sepolia** tramite SubnameRegistrar, trigger in `HandOff.unlock()` con try/catch (UC-16 — non blocca il completamento)
- **Fallback frontend**: se `SubnameMintFailed` è emesso nel receipt, `ensFallback.ts` estrae gli argomenti per un retry via `SubnameRegistrar.registerAndMint()`
- I campi `sellerEns` / `buyerEns` sono storati on-chain in `HandOff.sol` e passati come `hint` all'`EnsName` component (nessuna RPC call aggiuntiva se già noto)
- Per mainnet: serve ownership di `hand-off.eth` + SubnameRegistrar come controller

---

## Variabili d'Ambiente Frontend (VITE_*)

```
VITE_MOCK=false                    # mai true in produzione
VITE_REPUTATION_ADDRESS=           # override opzionale (default da addresses.ts)
VITE_FACTORY_ADDRESS=              # override opzionale
VITE_SUBNAME_ADDRESS=              # override opzionale
VITE_ALCHEMY_API_KEY=              # RPC key
UNISWAP_API_KEY=                   # Uniswap Trading API key — server-side only (Netlify env, NON prefisso VITE_)
VITE_DYNAMIC_ENVIRONMENT_ID=       # Dynamic.xyz env ID
VITE_WALLETCONNECT_PROJECT_ID=     # WalletConnect (non ancora usato)
```

**Netlify:** configurare le stesse var nel dashboard sotto *Site settings → Environment variables*.
Per il branch `test-jpier` usare scope "Branch deploys" o creare variabili specifiche per branch.
