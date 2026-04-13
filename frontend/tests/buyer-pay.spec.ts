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

test.describe('BuyerPay swap logic (mock e2e)', () => {
  test('ETH payout hides token selector and uses direct fund', async ({ page }) => {
    await openPayPage(page, 'ETH')

    await expect(page.locator('select')).toHaveCount(0)
    await expect(page.getByText('Protocol Fee (0.1%)')).toBeVisible()

    await page.getByRole('button', { name: 'Fund Escrow' }).click()
    await expect(page.getByRole('heading', { name: 'HandOff Funded' })).toBeVisible()
  })

  test('WETH payout can swap from USDC', async ({ page }) => {
    await openPayPage(page, 'WETH')

    await expect(page.locator('select')).toHaveCount(1)
    await page.selectOption('select', 'USDC')

    await expect(page.getByText(/Powered by Uniswap.*USDC.*WETH/)).toBeVisible()

    await page.getByRole('button', { name: /Pay .* USDC|Fund Escrow/ }).click()
    await expect(page.getByRole('heading', { name: 'HandOff Funded' })).toBeVisible({ timeout: 10_000 })
  })

  test('USDC payout defaults to direct fund and swaps only when changed', async ({ page }) => {
    await openPayPage(page, 'USDC')

    await expect(page.locator('select')).toHaveCount(1)
    await expect(page.getByText('Protocol Fee (0.1%)')).toBeVisible()
    await expect(page.getByText(/Powered by Uniswap/)).toHaveCount(0)

    await page.selectOption('select', 'WETH')
    await expect(page.getByText(/Powered by Uniswap.*WETH.*USDC/)).toBeVisible()
  })

  test('swap path exposes configurable slippage controls in the UI', async ({ page }) => {
    await openPayPage(page, 'WETH')

    await page.selectOption('select', 'USDC')

    const slippageRow = page.getByText('Slippage').locator('..')
    await expect(slippageRow.getByRole('button', { name: '0.1%', exact: true })).toBeVisible()
    await expect(slippageRow.getByRole('button', { name: '0.5%', exact: true })).toBeVisible()
    await expect(slippageRow.getByRole('button', { name: '1%', exact: true })).toBeVisible()

    await slippageRow.getByRole('button', { name: '1%', exact: true }).click()
    await expect(slippageRow.getByRole('button', { name: '1%', exact: true })).toHaveClass(/bg-hoff-accent/)

    await slippageRow.getByRole('button', { name: '0.1%', exact: true }).click()
    await expect(slippageRow.getByRole('button', { name: '0.1%', exact: true })).toHaveClass(/bg-hoff-accent/)
  })
})
