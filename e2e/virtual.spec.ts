import { expect, type Page, test } from '@playwright/test'
import { errors, expectConsistent, jumps, open, rectOf, resetJumps, settle, skeleton, stats, track, trackSkeleton, visible, wheel } from './helpers'

declare const W: any

async function ids(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const v: HTMLElement = W.list.viewport
    const r = v.getBoundingClientRect()
    return [...v.querySelectorAll<HTMLElement>('.eds-item [data-id]')]
      .filter((el) => {
        const b = el.getBoundingClientRect()
        return b.bottom > r.top && b.top < r.bottom
      })
      .map(el => Number(el.dataset.id))
  })
}

async function dragTo(page: Page, fraction: number, steps = 40, ms = 900): Promise<void> {
  await page.evaluate(async ({ fraction, steps, ms }) => {
    const v: HTMLElement = W.list.viewport
    const sign = W.list.root.dataset.origin === 'bottom' ? -1 : 1
    const max = v.scrollHeight - v.clientHeight
    const start = Math.abs(v.scrollTop)
    v.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true }))
    for (let k = 1; k <= steps; k++) {
      const target = start + (max * fraction - start) * (k / steps)
      v.scrollTop = sign * target
      await new Promise(r => setTimeout(r, ms / steps))
    }
    window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse' }))
  }, { fraction, steps, ms })
}

test.describe('виртуальный режим: чат', () => {
  test('стартует снизу, ползунок на всю историю', async ({ page }) => {
    await open(page, '/virtual.html?latency=200&live=0')
    const s = await page.evaluate(() => ({
      total: W.list.total,
      height: W.list.viewport.scrollHeight,
      stuck: W.list.isStuck,
      mode: W.list.mode,
    }))
    expect(s.mode).toBe('virtual')
    expect(s.total).toBe(100_000)
    expect(s.height).toBeGreaterThan(100_000 * 40)
    expect(s.stuck).toBe(true)
    expect(await visible(page, 100_000)).toBe(true)
    expect((await stats(page)).rendered).toBeLessThan(30)
    await expectConsistent(page)
    expect(await errors(page)).toEqual([])
  })

  test('перетаскивание ползунка в середину: грузится то, что на экране, без лишних запросов', async ({ page }) => {
    await open(page, '/virtual.html?latency=300&live=0')
    await track(page)
    const before = (await stats(page)).requests
    await dragTo(page, 0.5)
    const during = (await stats(page)).requests - before
    await settle(page)
    const shown = await ids(page)
    expect(during).toBeLessThanOrEqual(2)
    expect(shown.length).toBeGreaterThan(3)
    expect(Math.abs(shown[0] - 50_000)).toBeLessThan(10_000)
    expect((await stats(page)).requests - before).toBeLessThanOrEqual(4)
    expect(await jumps(page)).toEqual([])
    await expectConsistent(page)
    expect(await errors(page)).toEqual([])
  })

  test('прыжок к номеру ставит сообщение к краю и держит его, пока всё догружается', async ({ page }) => {
    await open(page, '/virtual.html?latency=400&live=0')
    await track(page)
    for (const align of ['start', 'center', 'end'] as const) {
      await page.evaluate(a => W.list.scrollToIndex(31_336, { align: a }), align)
      await resetJumps(page)
      await settle(page, 1500)
      expect(await jumps(page), align).toEqual([])
      const r = (await rectOf(page, 31_337))!
      const v = await page.evaluate(() => W.list.viewport.getBoundingClientRect().toJSON())
      const at = align === 'start' ? r.top - v.top : align === 'end' ? v.bottom - r.bottom : (r.top + r.bottom) / 2 - (v.top + v.bottom) / 2
      expect(Math.abs(at), align).toBeLessThan(2)
    }
    await expectConsistent(page)
  })

  test('прокрутка колесом через незагруженное после прыжка без сдвигов', async ({ page }) => {
    await open(page, '/virtual.html?latency=600&live=0')
    await page.evaluate(() => W.list.scrollToIndex(60_000, { align: 'center' }))
    await settle(page)
    await track(page)
    await wheel(page, -320, 5000)
    await wheel(page, 320, 9000)
    await settle(page)
    const s = await stats(page)
    expect(await jumps(page)).toEqual([])
    expect(s.busyWrites).toBe(0)
    expect(s.rendered).toBeLessThan(60)
    await expectConsistent(page)
    expect(await errors(page)).toEqual([])
  })

  test('далёкие загруженные данные выгружаются, и к ним можно вернуться', async ({ page }) => {
    await open(page, '/virtual.html?latency=100&live=0&max=200')
    await track(page)
    const seen: unknown[] = []
    for (const row of [10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000]) {
      seen.push(...await jumps(page))
      await page.evaluate(r => W.list.scrollToIndex(r, { align: 'start' }), row)
      await resetJumps(page)
      await settle(page, 200)
      await wheel(page, 300, 600)
      await settle(page, 200)
    }
    const s = await stats(page)
    expect(s.loaded).toBeLessThanOrEqual(200)
    seen.push(...await jumps(page))
    expect(seen).toEqual([])
    await page.evaluate(() => W.list.scrollToIndex(10_000, { align: 'start' }))
    await resetJumps(page)
    await settle(page)
    expect(await visible(page, 10_001)).toBe(true)
    expect(await jumps(page)).toEqual([])
    await expectConsistent(page)
    expect(await errors(page)).toEqual([])
  })

  test('новое сообщение у низа появляется сразу, total растёт', async ({ page }) => {
    await open(page, '/virtual.html?latency=200&live=0')
    const id = await page.evaluate(async () => {
      const m = W.backend.incoming()
      m.image = undefined
      await W.list.append([m])
      return m.id
    })
    await page.waitForTimeout(500)
    expect(await visible(page, id)).toBe(true)
    expect(await page.evaluate(() => W.list.total)).toBe(100_001)
    expect(await page.evaluate(() => W.list.isStuck)).toBe(true)
  })

  test('новое сообщение, пока читаешь середину, не сдвигает экран', async ({ page }) => {
    await open(page, '/virtual.html?latency=200&live=0')
    await page.evaluate(() => W.list.scrollToIndex(70_000, { align: 'center' }))
    await settle(page)
    await track(page)
    await wheel(page, 200, 2000, async () => {
      await page.evaluate(async () => {
        for (let k = 0; k < 3; k++)
          await W.list.append([W.backend.incoming()])
      })
    })
    await settle(page)
    expect(await jumps(page)).toEqual([])
    expect(await page.evaluate(() => W.list.total)).toBe(100_003)
    await expectConsistent(page)
  })

  test('при долгой загрузке не прыгают ни сообщения, ни серые плашки', async ({ page }) => {
    await open(page, '/virtual.html?latency=2500')
    await track(page)
    await trackSkeleton(page)
    for (let k = 0; k < 6; k++) {
      await wheel(page, -500, 1200)
      await page.waitForTimeout(800)
    }
    await page.waitForTimeout(2000)
    const sk = await skeleton(page)
    expect(sk.seen).toBeGreaterThan(20)
    expect(sk.jumps).toEqual([])
    expect(await jumps(page)).toEqual([])
    expect((await stats(page)).busyWrites).toBe(0)
    expect(await errors(page)).toEqual([])
  })

  test('сбои сети не ломают догрузку', async ({ page }) => {
    await open(page, '/virtual.html?latency=150&live=0&fail=0.4')
    await page.evaluate(() => W.list.scrollToIndex(45_000, { align: 'center' }))
    await page.waitForFunction(() => {
      const v: HTMLElement = W.list.viewport
      return v.querySelector('[data-id="45001"]') !== null
    }, null, { timeout: 30_000 })
    await settle(page)
    expect(await visible(page, 45_001)).toBe(true)
    await expectConsistent(page)
  })
})

test.describe('виртуальный режим: начало отсчёта сверху', () => {
  test('стартует сверху, середина и прокрутка без сдвигов', async ({ page }) => {
    await open(page, '/virtual.html?origin=top&latency=400&live=0')
    expect(await visible(page, 1)).toBe(true)
    await track(page)
    await dragTo(page, 0.5)
    await settle(page)
    const shown = await ids(page)
    expect(Math.abs(shown[0] - 50_000)).toBeLessThan(10_000)
    await wheel(page, -320, 5000)
    await wheel(page, 320, 5000)
    await settle(page)
    expect(await jumps(page)).toEqual([])
    expect((await stats(page)).busyWrites).toBe(0)
    await expectConsistent(page)
    expect(await errors(page)).toEqual([])
  })
})
