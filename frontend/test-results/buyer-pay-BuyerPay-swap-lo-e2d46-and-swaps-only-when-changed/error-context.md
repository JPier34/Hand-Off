# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: buyer-pay.spec.ts >> BuyerPay swap logic (mock e2e) >> USDC payout defaults to direct fund and swaps only when changed
- Location: tests\buyer-pay.spec.ts:48:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Protocol Fee (0.1%)')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Protocol Fee (0.1%)')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - button "HandOff" [ref=e6] [cursor=pointer]:
        - generic [ref=e7]: HandOff
      - button "Connect" [ref=e9] [cursor=pointer]
  - main [ref=e11]:
    - generic [ref=e12]:
      - generic [ref=e13]:
        - heading "Pay Escrow" [level=1] [ref=e14]
        - generic [ref=e15]: Awaiting payment
      - generic [ref=e17]:
        - paragraph [ref=e18]: "Deal #1"
        - paragraph [ref=e19]: Created 13.04.2026
    - generic [ref=e20]:
      - paragraph [ref=e21]: Amount Due
      - generic [ref=e22]:
        - generic [ref=e23]: 100000000000USDC
        - generic [ref=e24]:
          - generic [ref=e25]: Pay with
          - combobox [ref=e26] [cursor=pointer]:
            - option "ETH"
            - option "USDC" [selected]
            - option "WETH"
      - paragraph [ref=e27]: ≈ $100000000000.00 USD
    - generic [ref=e28]:
      - generic [ref=e29]:
        - generic [ref=e30]: Escrow Amount
        - generic [ref=e31]: 100000000000 USDC
      - generic [ref=e33]:
        - generic [ref=e34]: Total
        - generic [ref=e35]: 100000000000 USDC + gas
    - generic [ref=e37]:
      - generic [ref=e38]: Expires in
      - generic [ref=e39]: 167h 59m 54s
    - generic [ref=e42]:
      - generic [ref=e43]:
        - generic [ref=e44]: "00"
        - generic [ref=e45]:
          - paragraph [ref=e46]: Creator
          - generic [ref=e47]: 0x0000...0000
      - generic [ref=e48]:
        - generic [ref=e49]: Completed HandOffs
        - generic [ref=e50]: "16"
      - generic [ref=e51]:
        - generic [ref=e52]: Volume
        - generic [ref=e53]: 2.5 ETH
      - generic [ref=e54]:
        - generic [ref=e55]: Reputation
        - generic [ref=e56]:
          - generic [ref=e57]: 75% positive
          - generic [ref=e58]:
            - img [ref=e59]
            - generic [ref=e61]: "12"
          - generic [ref=e64]: "4"
    - button "Fund Escrow" [ref=e65] [cursor=pointer]
    - paragraph [ref=e66]: Funds will be held in escrow until both parties confirm
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | type TokenKey = 'ETH' | 'USDC' | 'WETH'
  4  | type MockApi = {
  5  |   reset: (dealId?: number) => void
  6  |   setDeal: (dealId: number, updates: { payoutToken: string | null }) => void
  7  |   TOKENS: Record<'USDC' | 'WETH', { address: string }>
  8  | }
  9  | 
  10 | async function openPayPage(page: import('@playwright/test').Page, payoutTokenKey: TokenKey) {
  11 |   await page.goto('/pay/1')
  12 | 
  13 |   await page.evaluate((key: TokenKey) => {
  14 |     const api = (window as unknown as { __handoffMock?: MockApi }).__handoffMock
  15 |     if (!api) throw new Error('Mock API missing')
  16 |     api.reset(1)
  17 |     const payoutToken = key === 'ETH' ? null : api.TOKENS[key].address
  18 |     api.setDeal(1, { payoutToken })
  19 |   }, payoutTokenKey)
  20 | 
  21 |   await page.getByRole('button', { name: 'Continue' }).click()
  22 |   await expect(page.getByRole('heading', { name: 'Pay Escrow' })).toBeVisible()
  23 | }
  24 | 
  25 | test.describe('BuyerPay swap logic (mock e2e)', () => {
  26 |   test('ETH payout hides token selector and uses direct fund', async ({ page }) => {
  27 |     await openPayPage(page, 'ETH')
  28 | 
  29 |     await expect(page.locator('select')).toHaveCount(0)
  30 |     await expect(page.getByText('Protocol Fee (0.1%)')).toBeVisible()
  31 | 
  32 |     await page.getByRole('button', { name: 'Fund Escrow' }).click()
  33 |     await expect(page.getByRole('heading', { name: 'HandOff Funded' })).toBeVisible()
  34 |   })
  35 | 
  36 |   test('WETH payout can swap from USDC', async ({ page }) => {
  37 |     await openPayPage(page, 'WETH')
  38 | 
  39 |     await expect(page.locator('select')).toHaveCount(1)
  40 |     await page.selectOption('select', 'USDC')
  41 | 
  42 |     await expect(page.getByText(/Powered by Uniswap.*USDC.*WETH/)).toBeVisible()
  43 | 
  44 |     await page.getByRole('button', { name: /Pay .* USDC|Fund Escrow/ }).click()
  45 |     await expect(page.getByRole('heading', { name: 'HandOff Funded' })).toBeVisible({ timeout: 10_000 })
  46 |   })
  47 | 
  48 |   test('USDC payout defaults to direct fund and swaps only when changed', async ({ page }) => {
  49 |     await openPayPage(page, 'USDC')
  50 | 
  51 |     await expect(page.locator('select')).toHaveCount(1)
> 52 |     await expect(page.getByText('Protocol Fee (0.1%)')).toBeVisible()
     |                                                         ^ Error: expect(locator).toBeVisible() failed
  53 |     await expect(page.getByText(/Powered by Uniswap/)).toHaveCount(0)
  54 | 
  55 |     await page.selectOption('select', 'WETH')
  56 |     await expect(page.getByText(/Powered by Uniswap.*WETH.*USDC/)).toBeVisible()
  57 |   })
  58 | 
  59 |   test('swap path exposes configurable slippage controls in the UI', async ({ page }) => {
  60 |     await openPayPage(page, 'WETH')
  61 | 
  62 |     await page.selectOption('select', 'USDC')
  63 | 
  64 |     const slippageRow = page.getByText('Slippage').locator('..')
  65 |     await expect(slippageRow.getByRole('button', { name: '0.1%', exact: true })).toBeVisible()
  66 |     await expect(slippageRow.getByRole('button', { name: '0.5%', exact: true })).toBeVisible()
  67 |     await expect(slippageRow.getByRole('button', { name: '1%', exact: true })).toBeVisible()
  68 | 
  69 |     await slippageRow.getByRole('button', { name: '1%', exact: true }).click()
  70 |     await expect(slippageRow.getByRole('button', { name: '1%', exact: true })).toHaveClass(/bg-hoff-accent/)
  71 | 
  72 |     await slippageRow.getByRole('button', { name: '0.1%', exact: true }).click()
  73 |     await expect(slippageRow.getByRole('button', { name: '0.1%', exact: true })).toHaveClass(/bg-hoff-accent/)
  74 |   })
  75 | })
  76 | 
```