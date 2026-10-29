import { expect, test } from '@playwright/test'
import { errors, expectConsistent, itemAt, jumps, open, rectOf, settle, stats, track, visible, wheel } from './helpers'

declare const W: any

test.describe('лента: начало отсчёта сверху', () => {
  test('стартует сверху со свежего поста', async ({ page }) => {
    await open(page, '/feed.html?latency=200&live=0')
    const s = await page.evaluate(() => ({ top: W.list.viewport.scrollTop, first: W.list.items[0].id, last: W.backend.latestId }))
    expect(s.top).toBe(0)
    expect(s.first).toBe(s.last)
    expect(await visible(page, s.first)).toBe(true)
  })

  test('подгрузка вниз во время прокрутки без сдвигов', async ({ page }) => {
    await open(page, '/feed.html?latency=500&live=0')
    await track(page)
    await wheel(page, 350, 8000)
    await settle(page)
    const s = await stats(page)
    expect(await jumps(page)).toEqual([])
    expect(s.busyWrites).toBe(0)
    expect(s.loaded).toBeGreaterThan(40)
    await expectConsistent(page)
    expect(await errors(page)).toEqual([])
  })

  test('новый пост сверху не сдвигает читаемое', async ({ page }) => {
    await open(page, '/feed.html?latency=200&live=0')
    await wheel(page, 400, 1500)
    await settle(page, 500)
    await track(page)
    const before = await itemAt(page, 0.5)
    await page.evaluate(async () => {
      const m = W.backend.incoming()
      await W.list.prepend([m])
    })
    await page.waitForTimeout(600)
    expect(Math.abs((await rectOf(page, before.id))!.top - before.top)).toBeLessThan(1)
    expect(await jumps(page)).toEqual([])
    await expectConsistent(page)
  })

  test('новый пост сверху, когда у верха, виден сразу', async ({ page }) => {
    await open(page, '/feed.html?latency=200&live=0')
    const id = await page.evaluate(async () => {
      const m = W.backend.incoming()
      m.image = undefined
      await W.list.prepend([m])
      return m.id
    })
    await page.waitForTimeout(500)
    expect(await visible(page, id)).toBe(true)
    expect(await page.evaluate(() => W.list.viewport.scrollTop)).toBe(0)
  })
})
