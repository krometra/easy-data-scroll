import { expect, type Page } from '@playwright/test'

export interface Jump {
  key: string
  d: number
}

export async function open(page: Page, path: string): Promise<void> {
  await page.addInitScript(() => {
    const w = window as any
    w.W = window
    w.__errors = []
    window.addEventListener('error', e => w.__errors.push(e.message))
    window.addEventListener('unhandledrejection', e => w.__errors.push(String(e.reason)))
  })
  page.on('console', (m) => {
    if (m.type() === 'warning' && m.text().includes('[Vue warn]'))
      void page.evaluate(t => (window as any).__errors.push(t), m.text())
  })
  await page.goto(path)
  await page.waitForFunction(() => (window as any).list?.size > 0, null, { timeout: 20_000 })
  await settle(page)
}

export async function settle(page: Page, ms = 400): Promise<void> {
  await page.waitForFunction(() => {
    const s = (window as any).list.loadState
    return s.before !== 'loading' && s.after !== 'loading' && s.range !== 'loading'
  }, null, { timeout: 20_000 })
  await page.waitForTimeout(ms)
}

export async function errors(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__errors)
}

export async function track(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any
    const list = w.list
    const v: HTMLElement = list.viewport
    const sign = list.root.dataset.origin === 'bottom' ? 1 : -1
    const st = { jumps: [] as Array<{ key: string, d: number }>, prev: null as any }
    w.__track = st
    const pos = () => Math.max(0, sign === 1 ? -v.scrollTop : v.scrollTop)
    const snap = () => {
      const vr = v.getBoundingClientRect()
      const m = new Map<string, number>()
      for (const el of v.querySelectorAll<HTMLElement>('.eds-item')) {
        const r = el.getBoundingClientRect()
        if (r.bottom > vr.top && r.top < vr.bottom)
          m.set(el.querySelector<HTMLElement>('[data-id]')?.dataset.id ?? '', r.top)
      }
      return { pos: pos(), shift: list.stats.shift, m, stuck: list.isStuck, h: v.scrollHeight, phase: w.__phase }
    }
    const tick = () => {
      const cur = snap()
      const p = st.prev
      if (p && !cur.stuck && !p.stuck) {
        const user = (cur.pos - p.pos) - (cur.shift - p.shift)
        for (const [k, top] of cur.m) {
          if (!p.m.has(k))
            continue
          const d = (top - p.m.get(k)) - sign * user
          if (Math.abs(d) > 1) {
            st.jumps.push({ key: k, d: Math.round(d * 10) / 10 })
            if (w.__debugJumps)
              console.log(JSON.stringify({ key: k, d, dPos: cur.pos - p.pos, dShift: cur.shift - p.shift, dH: cur.h - p.h, phase: cur.phase, pos: cur.pos }))
            break
          }
        }
      }
      st.prev = cur
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

export async function resetJumps(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const st = (window as any).__track
      st.jumps = []
      resolve()
    }))
  }))
}

export async function trackSkeleton(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any
    const list = w.list
    const v: HTMLElement = list.viewport
    const sign = list.root.dataset.origin === 'bottom' ? 1 : -1
    const st = { jumps: [] as number[], frames: 0, seen: 0, prev: null as any }
    w.__skeleton = st
    const pos = () => Math.max(0, sign === 1 ? -v.scrollTop : v.scrollTop)
    const tick = () => {
      const vr = v.getBoundingClientRect()
      const row = Number.parseFloat(getComputedStyle(list.root).getPropertyValue('--eds-row')) || 64
      let line: number | null = null
      for (const el of v.querySelectorAll<HTMLElement>('.eds-gap')) {
        const r = el.getBoundingClientRect()
        if (r.bottom > vr.top + 20 && r.top < vr.bottom - 20) {
          const by = Number.parseFloat(getComputedStyle(el).backgroundPositionY) || 0
          line = (((r.top + by) % row) + row) % row
          break
        }
      }
      const cur = { pos: pos(), shift: list.stats.shift, line, row }
      const p = st.prev
      st.frames++
      if (line !== null)
        st.seen++
      if (p && p.line !== null && line !== null && p.row === row) {
        const user = (cur.pos - p.pos) - (cur.shift - p.shift)
        const want = p.line + sign * user
        const dd = ((((line - want) % row) + row) % row)
        const d = Math.min(dd, row - dd)
        if (d > 1)
          st.jumps.push(Math.round(d))
      }
      st.prev = cur
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

export async function skeleton(page: Page): Promise<{ jumps: number[], frames: number, seen: number }> {
  return page.evaluate(() => {
    const st = (window as any).__skeleton
    return { jumps: st.jumps, frames: st.frames, seen: st.seen }
  })
}

export async function jumps(page: Page): Promise<Jump[]> {
  return page.evaluate(() => (window as any).__track.jumps)
}

export async function wheel(page: Page, dy: number, ms: number, during?: () => Promise<void>, at = 0.5): Promise<void> {
  const box = (await page.locator('.eds-viewport').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const end = Date.now() + ms
  let fired = false
  while (Date.now() < end) {
    await page.mouse.wheel(0, dy)
    await page.waitForTimeout(16)
    if (during && !fired && Date.now() > end - ms * (1 - at)) {
      fired = true
      await during()
    }
  }
}

export async function stats(page: Page) {
  return page.evaluate(() => ({ ...(window as any).list.stats, dbg: (window as any).list.debug() }))
}

export async function expectConsistent(page: Page): Promise<void> {
  const s = await stats(page)
  expect(Math.abs(s.dbg.model - s.dbg.dom)).toBeLessThan(1)
  expect(s.dbg.mismatched).toBe(0)
}

export async function itemAt(page: Page, fraction: number): Promise<{ id: string, top: number, bottom: number }> {
  return page.evaluate((f) => {
    const v: HTMLElement = (window as any).list.viewport
    const r = v.getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * f)!.closest('.eds-item')!
    const rr = el.getBoundingClientRect()
    return { id: el.querySelector<HTMLElement>('[data-id]')!.dataset.id!, top: rr.top, bottom: rr.bottom }
  }, fraction)
}

export async function rectOf(page: Page, id: string | number) {
  return page.evaluate(i => document.querySelector(`.eds-viewport [data-id="${i}"]`)?.closest('.eds-item')?.getBoundingClientRect().toJSON() ?? null, String(id))
}

export async function visible(page: Page, id: string | number): Promise<boolean> {
  return page.evaluate((i) => {
    const el = document.querySelector(`.eds-viewport [data-id="${i}"]`)
    if (!el)
      return false
    const v = (window as any).list.viewport.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return r.bottom > v.top + 1 && r.top < v.bottom - 1
  }, String(id))
}
