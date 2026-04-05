/**
 * HandOff — Uniswap fundWithSwap() + unlock() demo script
 *
 * Executes a real end-to-end deal on ETH Sepolia:
 *   1. Creates a HandOff escrow via HandOffFactory (ERC-20 payout token)
 *   2. Calls fundWithSwap() using the Uniswap Trading API to swap input token → payout token
 *   3. Calls unlock() to release funds to the seller
 *
 * Outputs:
 *   ✅ createHandOff() tx: 0x...
 *   ✅ fundWithSwap()   tx: 0x...
 *   ✅ unlock()         tx: 0x...
 *
 * Usage (run from the repo root):
 *   cd /path/to/Hand-Off
 *   npx tsx --tsconfig frontend/tsconfig.json scripts/demo-swap.ts
 *
 *   Or install tsx globally first: npm i -g tsx
 *   Then: tsx scripts/demo-swap.ts
 *
 * Required environment variables (from root .env or set in shell):
 *   ALCHEMY_API_KEY  — ETH Sepolia RPC key
 *   PRIVATE_KEY      — deployer / seller wallet (0x-prefixed)
 *   UNISWAP_API_KEY  — Uniswap Trading API key
 */

import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseUnits,
  keccak256,
  toUtf8Bytes,
  encodeFunctionData,
  formatUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

// ─── Config ───────────────────────────────────────────────────────────────────

const ALCHEMY_KEY   = process.env.ALCHEMY_API_KEY ?? ''
const PRIVATE_KEY   = (process.env.PRIVATE_KEY ?? '') as `0x${string}`
const UNISWAP_KEY   = process.env.UNISWAP_API_KEY ?? ''

if (!ALCHEMY_KEY || !PRIVATE_KEY || !UNISWAP_KEY) {
  console.error('Missing env vars. Set ALCHEMY_API_KEY, PRIVATE_KEY, UNISWAP_API_KEY')
  process.exit(1)
}

const RPC_URL = `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`
const UNISWAP_API = 'https://trade-api.gateway.uniswap.org/v1'

// Deployed contract addresses — ETH Sepolia (chain 11155111)
const FACTORY_ADDRESS    = '0xe6A1B57738eBc3EC39975B0aFcE321d962d3a429' as `0x${string}`
const ALLOWED_ROUTER     = '0x492e6456d9528771018deb9e87ef7750ef184104' as `0x${string}`

// Test tokens on ETH Sepolia
// Payout token: USDC on Sepolia (6 decimals)
const USDC_SEPOLIA       = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as `0x${string}`
// Input token for swap: WETH on Sepolia (9 decimals on Sepolia test deployment)
const WETH_SEPOLIA       = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' as `0x${string}`

// Deal parameters
const PAYOUT_AMOUNT_USDC = parseUnits('1', 6)    // seller wants 1 USDC
const EXPIRY_WINDOW      = BigInt(3600)           // 1 hour
const UNLOCK_CODE        = 'A1B2'                 // 4-char base36 code for the demo

// ─── ABIs (minimal) ───────────────────────────────────────────────────────────

const FACTORY_ABI = [
  {
    name: 'createHandOff',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_payoutToken',         type: 'address' },
      { name: '_amount',              type: 'uint256' },
      { name: '_expirationWindow',    type: 'uint256' },
      { name: '_sellerEns',           type: 'string'  },
      { name: '_sellerPayoutAddress', type: 'address' },
    ],
    outputs: [
      { name: 'escrow', type: 'address' },
      { name: 'dealId', type: 'uint256' },
    ],
  },
] as const

const HANDOFF_ABI = [
  {
    name: 'fundWithSwap',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_router',      type: 'address' },
      { name: '_inputToken',  type: 'address' },
      { name: '_inputAmount', type: 'uint256' },
      { name: '_swapData',    type: 'bytes'   },
      { name: '_codeHash',    type: 'bytes32' },
      { name: '_buyerEns',    type: 'string'  },
    ],
    outputs: [],
  },
  {
    name: 'unlock',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_unlockCode', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'getState',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uniswapHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': UNISWAP_KEY,
    'x-universal-router-version': '2.0',
  }
}

async function fetchQuote(swapper: string, inputToken: string, outputToken: string, outputAmount: string) {
  const res = await fetch(`${UNISWAP_API}/quote`, {
    method: 'POST',
    headers: uniswapHeaders(),
    body: JSON.stringify({
      swapper,
      tokenIn:         inputToken,
      tokenOut:        outputToken,
      tokenInChainId:  '11155111',
      tokenOutChainId: '11155111',
      amount:          outputAmount,
      type:            'EXACT_OUTPUT',
      slippageTolerance: 1.0,
      routingPreference: 'BEST_PRICE',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Quote failed: ${JSON.stringify(data)}`)
  return data
}

async function fetchSwapCalldata(quote: unknown) {
  const res = await fetch(`${UNISWAP_API}/swap`, {
    method: 'POST',
    headers: uniswapHeaders(),
    body: JSON.stringify(quote),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Swap failed: ${JSON.stringify(data)}`)
  if (!data.swap?.data || data.swap.data === '0x') throw new Error('Empty swap calldata')
  return data.swap as { to: string; data: string; value: string }
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY)
  console.log(`\nWallet: ${account.address}`)
  console.log(`Chain:  ETH Sepolia (11155111)\n`)

  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) })

  // ── Step 1: Create HandOff escrow via factory ────────────────────────────────
  console.log('Step 1 — Creating HandOff escrow (USDC payout, 1 USDC)...')

  const createHash = await walletClient.writeContract({
    address:      FACTORY_ADDRESS,
    abi:          FACTORY_ABI,
    functionName: 'createHandOff',
    args: [
      USDC_SEPOLIA,
      PAYOUT_AMOUNT_USDC,
      EXPIRY_WINDOW,
      '',
      '0x0000000000000000000000000000000000000000',
    ],
  })

  console.log(`  ✅ createHandOff() tx: ${createHash}`)
  console.log('  Waiting for confirmation...')

  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createHash })
  if (createReceipt.status !== 'success') throw new Error('createHandOff reverted')

  // Parse HandOffCreated event: topics[2] = escrow, topics[3] = dealId (all indexed)
  const createLog = createReceipt.logs.find(
    l => l.topics.length === 4 && l.address.toLowerCase() === FACTORY_ADDRESS.toLowerCase()
  )
  if (!createLog) throw new Error('HandOffCreated event not found in receipt')
  const escrowAddress = ('0x' + createLog.topics[2]!.slice(26)) as `0x${string}`
  const dealId = BigInt(createLog.topics[3]!)
  console.log(`  Escrow: ${escrowAddress}`)
  console.log(`  Deal ID: ${dealId}\n`)

  // ── Step 2: Get Uniswap quote and swap calldata ───────────────────────────────
  console.log('Step 2 — Fetching Uniswap Trading API quote (WETH → USDC)...')

  const quote = await fetchQuote(
    account.address,
    WETH_SEPOLIA,
    USDC_SEPOLIA,
    PAYOUT_AMOUNT_USDC.toString(),
  )

  // Extract input amount from quote
  let inputAmount: bigint
  if (quote.routing === 'CLASSIC') {
    inputAmount = BigInt(quote.quote.input.amount)
    console.log(`  Quote: ${formatUnits(inputAmount, 18)} WETH → 1 USDC (${quote.routing})`)
  } else {
    const inp = quote.quote.orderInfo?.input?.startAmount ?? quote.quote.input?.amount ?? '0'
    inputAmount = BigInt(inp)
    console.log(`  Quote: ${formatUnits(inputAmount, 18)} WETH → 1 USDC (${quote.routing})`)
  }

  // Add 1% buffer for slippage
  const inputWithBuffer = inputAmount * 101n / 100n

  console.log('  Fetching swap calldata...')
  const swapTx = await fetchSwapCalldata(quote)
  console.log(`  Router calldata: ${swapTx.data.slice(0, 20)}...`)

  // ── Step 3: Approve WETH for the escrow contract ─────────────────────────────
  console.log('\nStep 3 — Approving WETH for escrow contract...')

  const approveHash = await walletClient.writeContract({
    address:      WETH_SEPOLIA,
    abi:          ERC20_ABI,
    functionName: 'approve',
    args:         [escrowAddress, inputWithBuffer],
  })
  console.log(`  Approve tx: ${approveHash}`)
  const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
  if (approveReceipt.status !== 'success') throw new Error('Approve reverted')
  console.log('  ✅ Approved\n')

  // ── Step 4: fundWithSwap() ────────────────────────────────────────────────────
  console.log('Step 4 — Calling fundWithSwap() (swap WETH → USDC, deposit in escrow)...')

  const codeHash = keccak256(toUtf8Bytes(UNLOCK_CODE)) as `0x${string}`

  const fundHash = await walletClient.writeContract({
    address:      escrowAddress,
    abi:          HANDOFF_ABI,
    functionName: 'fundWithSwap',
    args: [
      ALLOWED_ROUTER,
      WETH_SEPOLIA,
      inputWithBuffer,
      swapTx.data as `0x${string}`,
      codeHash,
      '',
    ],
  })

  console.log(`  ✅ fundWithSwap() tx: ${fundHash}`)
  console.log('  Waiting for confirmation...')
  const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundHash })
  if (fundReceipt.status !== 'success') throw new Error('fundWithSwap reverted')
  console.log('  ✅ Escrow funded\n')

  // ── Step 5: unlock() — release funds to seller ───────────────────────────────
  console.log('Step 5 — Calling unlock() to release funds to seller...')
  console.log(`  Unlock code: ${UNLOCK_CODE}  (hash: ${codeHash})`)

  await wait(2000) // brief pause for node indexing

  const unlockHash = await walletClient.writeContract({
    address:      escrowAddress,
    abi:          HANDOFF_ABI,
    functionName: 'unlock',
    args:         [codeHash],
  })

  console.log(`  ✅ unlock() tx: ${unlockHash}`)
  const unlockReceipt = await publicClient.waitForTransactionReceipt({ hash: unlockHash })
  if (unlockReceipt.status !== 'success') throw new Error('unlock reverted')

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────')
  console.log('  HandOff Demo — ETH Sepolia Transactions')
  console.log('─────────────────────────────────────────────────')
  console.log(`  Deal ID:     ${dealId}`)
  console.log(`  Escrow:      ${escrowAddress}`)
  console.log(`  Payout:      1 USDC → seller (${account.address})`)
  console.log('')
  console.log(`  ✅ createHandOff() tx: ${createHash}`)
  console.log(`  ✅ fundWithSwap()   tx: ${fundHash}`)
  console.log(`  ✅ unlock()         tx: ${unlockHash}`)
  console.log('─────────────────────────────────────────────────')
  console.log('\nPaste the tx hashes above into UNISWAP_INTEGRATION.md')
  console.log(`ENS subname to verify: deal-${dealId}.hand-off.eth`)
  console.log('  → https://sepolia.app.ens.domains\n')
}

main().catch(err => {
  console.error('\n❌ Script failed:', err.message ?? err)
  process.exit(1)
})
