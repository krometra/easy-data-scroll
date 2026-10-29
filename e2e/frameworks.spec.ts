import { expect, test } from '@playwright/test'
import { errors, expectConsistent, jumps, open, rectOf, settle, stats, track, wheel } from './helpers'

declare const W: any

for (const fw of ['vue', 'react', 'angular']) {
  test.describe(`адаптер ${fw}`, () => {
    test('рендер, подгрузка и обновление элемента', async ({ page }) => {
      await open(page, `/${fw}.html?latency=300&live=0`)
      const empty = await page.evaluate(() => [...W.list.content.querySelectorAll('.eds-host')].filter((h: Element) => !h.querySelector('.msg')).length)
      expect(empty).toBe(0)
      await track(page)
      await wheel(page, -350, 5000)
      await settle(page)
      expect(await jumps(page)).toEqual([])
      expect((await stats(page)).loaded).toBeGreaterThan(80)
      await expectConsistent(page)

      const id = await page.evaluate(() => W.list.items.findLast((m: any) => m.long)?.id)
      await page.evaluate(i => W.list.scrollToKey(i), id)
      await page.waitForTimeout(400)
      const before = await rectOf(page, id)
      await page.locator(`.eds-viewport [data-id="${id}"] .more`).click()
      await expect(page.locator(`.eds-viewport [data-id="${id}"] .text`)).not.toHaveClass(/collapsed/)
      await page.waitForTimeout(300)
      const after = await rectOf(page, id)
      expect(after!.height).toBeGreaterThan(before!.height + 10)
      expect(Math.abs(after!.bottom - before!.bottom)).toBeLessThan(1)
      await expectConsistent(page)

      const m = await page.evaluate(async () => {
        await W.list.scrollToBottom()
        const m = W.backend.incoming()
        m.image = undefined
        await W.list.append([m])
        return m.id
      })
      await expect(page.locator(`.eds-viewport [data-id="${m}"]`)).toBeVisible()
      expect(await errors(page)).toEqual([])
    })
  })
}
