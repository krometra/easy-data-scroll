import { expect, test } from '@playwright/test'
import { errors, expectConsistent, itemAt, jumps, open, rectOf, settle, stats, track, visible, wheel } from './helpers'

declare const W: any

test.describe('чат: начало отсчёта снизу', () => {
  test('стартует снизу, последнее сообщение видно', async ({ page }) => {
    await open(page, '/chat.html?latency=200&live=0')
    const s = await page.evaluate(() => ({ top: W.list.viewport.scrollTop, stuck: W.list.isStuck, last: W.backend.latestId }))
    expect(s.top).toBe(0)
    expect(s.stuck).toBe(true)
    expect(await visible(page, s.last)).toBe(true)
    await expectConsistent(page)
  })

  test('история грузится во время непрерывной прокрутки без единого сдвига', async ({ page }) => {
    await open(page, '/chat.html?latency=500&live=0')
    await track(page)
    await wheel(page, -350, 9000)
    await settle(page)
    const s = await stats(page)
    expect(await jumps(page)).toEqual([])
    expect(s.busyWrites).toBe(0)
    expect(s.loaded).toBeGreaterThan(150)
    expect(s.rendered).toBeLessThan(45)
    expect(await page.locator('.eds-viewport .eds-item').count()).toBe(s.rendered)
    await expectConsistent(page)
    expect(await errors(page)).toEqual([])
  })

  test('новое сообщение, когда прилип к низу, появляется внизу', async ({ page }) => {
    await open(page, '/chat.html?latency=200&live=0')
    const id = await page.evaluate(async () => {
      const m = W.backend.incoming()
      m.image = undefined
      await W.list.append([m])
      return m.id
    })
    await page.waitForTimeout(500)
    expect(await visible(page, id)).toBe(true)
    expect(await page.evaluate(() => [W.list.viewport.scrollTop, W.list.isStuck])).toEqual([0, true])
    await expectConsistent(page)
  })

  test('новое сообщение, пока читаешь историю, не сдвигает экран', async ({ page }) => {
    await open(page, '/chat.html?latency=200&live=0')
    await wheel(page, -400, 1500)
    await settle(page, 500)
    await track(page)
    const before = await itemAt(page, 0.5)
    const id = await page.evaluate(async () => {
      const m = W.backend.incoming()
      await W.list.append([m])
      return m.id
    })
    await page.waitForTimeout(600)
    const after = await rectOf(page, before.id)
    expect(Math.abs(after!.top - before.top)).toBeLessThan(1)
    expect(await page.evaluate(i => W.list.has(i), id)).toBe(true)
    expect(await jumps(page)).toEqual([])
  })

  test('новое сообщение посреди прокрутки ждёт паузы и не трогает scrollTop', async ({ page }) => {
    await open(page, '/chat.html?latency=300&live=0')
    await wheel(page, -300, 800)
    await track(page)
    const w0 = (await stats(page)).busyWrites
    let id = 0
    await wheel(page, -150, 2500, async () => {
      id = await page.evaluate(async () => {
        const m = W.backend.incoming()
        await W.list.append([m])
        return m.id
      })
    })
    await settle(page, 600)
    expect((await stats(page)).busyWrites).toBe(w0)
    expect(await jumps(page)).toEqual([])
    expect(await page.evaluate(i => W.list.has(i), id)).toBe(true)
    await expectConsistent(page)
  })

  test('смена ширины у низа оставляет у низа', async ({ page }) => {
    await open(page, '/chat.html?latency=200&live=0')
    const last = await page.evaluate(() => W.backend.latestId)
    await page.evaluate(() => document.querySelector<HTMLElement>('.chat')!.style.setProperty('--chat-width', '480px'))
    await page.waitForTimeout(1200)
    expect(await page.evaluate(() => [W.list.viewport.scrollTop, W.list.isStuck])).toEqual([0, true])
    expect(await visible(page, last)).toBe(true)
    await expectConsistent(page)
  })

  test('смена ширины посреди истории держит то, что было у нижнего края', async ({ page }) => {
    await open(page, '/chat.html?latency=200&live=0')
    await wheel(page, -400, 1500)
    await settle(page, 500)
    const anchor = await itemAt(page, 0.92)
    await page.evaluate(() => document.querySelector<HTMLElement>('.chat')!.style.setProperty('--chat-width', '520px'))
    await page.waitForTimeout(1500)
    expect(await visible(page, anchor.id)).toBe(true)
    await expectConsistent(page)
    await track(page)
    await wheel(page, 400, 1500)
    await settle(page, 300)
    expect(await jumps(page)).toEqual([])
  })

  test('прыжок к старому сообщению и прокрутка вниз к новым без сдвигов', async ({ page }) => {
    await open(page, '/chat.html?latency=300&live=0')
    await page.evaluate(async () => {
      const items = await W.backend.around(31337)
      await W.list.reset(items, { anchor: 31337, hasBefore: true, hasAfter: true })
    })
    await page.waitForTimeout(300)
    expect(await visible(page, 31337)).toBe(true)
    const r = await rectOf(page, 31337)
    const box = (await page.locator('.eds-viewport').boundingBox())!
    expect(Math.abs((r!.top + r!.bottom) / 2 - (box.y + box.height / 2))).toBeLessThan(box.height / 3)
    await track(page)
    await wheel(page, 350, 6000)
    await settle(page)
    const last = await page.evaluate(() => W.list.items.at(-1).id)
    expect(last).toBeGreaterThan(31337 + 150)
    expect(await jumps(page)).toEqual([])
    await expectConsistent(page)
  })

  test('«Вниз» после прыжка возвращает к самым свежим', async ({ page }) => {
    await open(page, '/chat.html?latency=200&live=0')
    await page.evaluate(async () => {
      const items = await W.backend.around(500)
      await W.list.reset(items, { anchor: 500, hasBefore: true, hasAfter: true })
    })
    await page.evaluate(() => W.list.scrollToBottom())
    await page.waitForFunction(() => W.list.items.at(-1)?.id === W.backend.latestId)
    await settle(page)
    expect(await page.evaluate(() => W.list.isStuck)).toBe(true)
    expect(await visible(page, await page.evaluate(() => W.backend.latestId))).toBe(true)
  })

  test('раскрытие видимого сообщения не двигает его нижний край', async ({ page }) => {
    await open(page, '/chat.html?latency=100&live=0')
    const id = await page.evaluate(() => W.list.items.findLast((m: any) => m.long)?.id)
    expect(id).toBeTruthy()
    await page.evaluate(i => W.list.scrollToKey(i), id)
    await page.waitForTimeout(400)
    const before = await rectOf(page, id)
    await page.locator(`.eds-viewport [data-id="${id}"] .more`).click()
    await page.waitForTimeout(400)
    const after = await rectOf(page, id)
    expect(after!.height).toBeGreaterThan(before!.height + 10)
    expect(Math.abs(after!.bottom - before!.bottom)).toBeLessThan(1)
    await expectConsistent(page)
  })

  test('удаление сообщения ниже экрана не сдвигает читаемое', async ({ page }) => {
    await open(page, '/chat.html?latency=200&live=0')
    await wheel(page, -400, 1500)
    await settle(page, 500)
    await track(page)
    const before = await itemAt(page, 0.5)
    const removed = await page.evaluate(() => {
      const id = W.backend.latestId
      return W.list.remove(id) && !W.list.has(id)
    })
    expect(removed).toBe(true)
    await page.waitForTimeout(300)
    expect(Math.abs((await rectOf(page, before.id))!.top - before.top)).toBeLessThan(1)
    expect(await jumps(page)).toEqual([])
    await expectConsistent(page)
  })

  test('сбои сети не ломают подгрузку', async ({ page }) => {
    await open(page, '/chat.html?latency=200&live=0&fail=0.3')
    await wheel(page, -400, 9000)
    await settle(page)
    expect((await stats(page)).loaded).toBeGreaterThan(60)
    await expectConsistent(page)
    expect(await errors(page)).toEqual([])
  })
})
