import { test, expect } from '@playwright/test'

type TokenKey = 'ETH' | 'USDC' | 'WETH'
type MockApi = {
  reset: (dealId?: number) => void
  setDeal: (dealId: number, updates: { payoutToken: string | null }) => void
  TOKENS: Record<'USDC' | 'WETH', { address: string }>
}

async function openPayPage(page: import('@playwright/test').Page, payoutTokenKey: TokenKey) {
  await page.goto('/pay/1')

  await page.evaluate((key: TokenKey) => {
    const api = (window as unknown as { __handoffMock?: MockApi }).__handoffMock
    if (!api) throw new Error('Mock API missing')
    api.reset(1)
    const payoutToken = key === 'ETH' ? null : api.TOKENS[key].address
    api.setDeal(1, { payoutToken })
  }, payoutTokenKey)

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Pay Escrow' })).toBeVisible()
}

async function selectToken(page: import('@playwright/test').Page, symbol: string) {
  const selector = page.locator('[data-testid="token-selector"]')
  await selector.getByRole('button').first().click()
  await selector.getByRole('button', { name: symbol }).last().click()
}

test.describe('BuyerPay swap logic (mock e2e)', () => {
  test('ETH payout hides token selector and uses direct fund', async ({ page }) => {
    await openPayPage(page, 'ETH')

    await expect(page.locator('[data-testid="token-selector"]')).toHaveCount(0)
    await expect(page.getByText('Protocol Fee (0.01%)')).toBeVisible()
    await expect(page.getByText('Total').locator('..')).toContainText('0.10001 ETH + gas')

    await page.getByRole('button', { name: /Pay.*ETH/ }).click()
    await expect(page.getByRole('heading', { name: 'HandOff Funded' })).toBeVisible()
  })

  test('WETH payout can swap from USDC', async ({ page }) => {
    await openPayPage(page, 'WETH')

    await expect(page.locator('[data-testid="token-selector"]')).toHaveCount(1)
    await selectToken(page, 'USDC')

    await expect(page.getByText(/Powered by Uniswap.*USDC.*WETH/)).toBeVisible()

    await page.getByRole('button', { name: /Pay .* USDC|Fund Escrow/ }).click()
    await expect(page.getByRole('heading', { name: 'HandOff Funded' })).toBeVisible({ timeout: 10_000 })
  })

  test('USDC payout defaults to direct fund and swaps only when changed', async ({ page }) => {
    await openPayPage(page, 'USDC')

    await expect(page.locator('[data-testid="token-selector"]')).toHaveCount(1)
    await expect(page.getByText('Protocol Fee (0.01%)')).toBeVisible()
    await expect(page.getByText(/Powered by Uniswap/)).toHaveCount(0)

    await selectToken(page, 'WETH')
    await expect(page.getByText(/Powered by Uniswap.*WETH.*USDC/)).toBeVisible()
  })

  test('swap path shows fixed slippage in footer', async ({ page }) => {
    await openPayPage(page, 'WETH')

    await selectToken(page, 'USDC')

    await expect(page.getByText('Slippage tolerance')).toBeVisible()
    await expect(page.getByText('0.5%')).toBeVisible()
  })
})
