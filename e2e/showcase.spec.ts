import { expect, type Page, test } from '@playwright/test'

async function frame(page: Page) {
  return page.evaluate(() => {
    const v = document.querySelector<HTMLElement>('.live__frame .eds-viewport')!
    const authors = [...v.querySelectorAll('.eds-item .author')].map(a => a.textContent!.trim())
    const stat = [...document.querySelectorAll<HTMLElement>('.k-stat')].map(s => s.innerText.replace(/\s+/g, ' ')).find(t => t.startsWith('Загружено'))!
    return { height: v.scrollHeight, authors: [...new Set(authors)], total: Number(stat.match(/из ([\d\s\u00a0]+)/)![1].replace(/\D/g, '')) }
  })
}

async function pick(page: Page, name: string) {
  await page.locator('.live__author').click()
  await page.getByRole('option', { name }).click()
  await expect.poll(async () => (await frame(page)).authors.length > 0 && (name === 'Все авторы' || (await frame(page)).authors.every(a => a === name)), { timeout: 15_000 }).toBe(true)
}

test.describe('витрина', () => {
  test('фильтр меняет total с бэкенда и высоту ползунка', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto('/?')
    await expect.poll(async () => (await frame(page)).authors.length, { timeout: 20_000 }).toBeGreaterThan(0)
    const all = await frame(page)
    expect(all.total).toBeGreaterThanOrEqual(100_000)

    await pick(page, 'Сова Луна')
    await expect.poll(async () => (await frame(page)).total, { timeout: 15_000 }).toBeLessThan(30_000)
    const owl = await frame(page)
    expect(owl.total).toBeGreaterThan(5_000)
    expect(owl.height).toBeLessThan(all.height / 2)

    await pick(page, 'Все авторы')
    await expect.poll(async () => (await frame(page)).total, { timeout: 15_000 }).toBeGreaterThanOrEqual(100_000)
    expect(errors).toEqual([])
  })
})
