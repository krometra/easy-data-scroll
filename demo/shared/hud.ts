import type { InfinityScroll } from '@krometra/easy-data-scroll'

export interface Probe {
  frames: number
  longFrames: number
  jumps: number
  maxJump: number
  fps: number
}

export function startProbe(list: InfinityScroll<unknown>): Probe {
  const probe: Probe = { frames: 0, longFrames: 0, jumps: 0, maxJump: 0, fps: 0 }
  const v = list.viewport
  let last = performance.now()
  let windowStart = last
  let windowFrames = 0
  let anchor: Element | null = null
  let anchorTop = 0
  let pos = 0
  let shift = 0
  const sign = list.root.dataset.origin === 'bottom' ? 1 : -1
  const readPos = () => Math.max(0, sign === 1 ? -v.scrollTop : v.scrollTop)

  const pick = (): Element | null => {
    const r = v.getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return el?.closest('.eds-item') ?? null
  }

  const tick = (now: number) => {
    const dt = now - last
    last = now
    probe.frames++
    windowFrames++
    if (dt > 34)
      probe.longFrames++
    if (now - windowStart >= 1000) {
      probe.fps = Math.round((windowFrames * 1000) / (now - windowStart))
      windowStart = now
      windowFrames = 0
    }
    const p = readPos()
    const sh = list.stats.shift
    if (anchor && anchor.isConnected && !list.isStuck) {
      const top = anchor.getBoundingClientRect().top
      const jump = Math.abs(top - anchorTop - sign * ((p - pos) - (sh - shift)))
      if (jump > 1) {
        probe.jumps++
        probe.maxJump = Math.max(probe.maxJump, jump)
      }
    }
    anchor = pick()
    anchorTop = anchor?.getBoundingClientRect().top ?? 0
    pos = p
    shift = sh
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return probe
}

interface Control {
  label: string
  html: string
  bind: (el: HTMLElement) => void
}

export function mountHud(root: HTMLElement, list: InfinityScroll<unknown>, controls: Control[]): Probe {
  const probe = startProbe(list)
  root.innerHTML = `
<h2>Что происходит</h2>
<dl id="stats"></dl>
<h2>Условия</h2>
<div id="controls"></div>
<p>Счётчик «сдвигов» ловит кадры, где содержимое уехало без участия пользователя. «Записей scrollTop во время скролла» должно быть 0: позицию не трогаем, пока колесо или палец в деле.</p>`
  const box = root.querySelector('#controls')!
  for (const c of controls) {
    const wrap = document.createElement('div')
    wrap.innerHTML = c.html
    box.append(wrap)
    c.bind(wrap)
  }
  const stats = root.querySelector('#stats')!
  const row = (k: string, v: string | number, cls = '') => `<dt>${k}</dt><dd class="${cls}">${v}</dd>`
  setInterval(() => {
    const s = list.stats
    const dom = list.content.getElementsByTagName('*').length
    stats.innerHTML = [
      row('Загружено сообщений', s.loaded.toLocaleString('ru')),
      ...(list.mode === 'virtual'
        ? [row('Строк всего', s.total.toLocaleString('ru')), row('Запросов страниц', s.requests)]
        : []),
      row('В DOM сейчас', s.rendered),
      row('В кэше узлов', s.cached),
      row('DOM-узлов всего', dom.toLocaleString('ru')),
      row('Отрендерено за всё время', s.created.toLocaleString('ru')),
      row('Записей scrollTop', s.scrollWrites),
      row('…во время скролла', s.busyWrites, s.busyWrites ? 'bad' : 'good'),
      row('Сдвигов содержимого', probe.jumps, probe.jumps ? 'bad' : 'good'),
      row('FPS', probe.fps, probe.fps >= 55 ? 'good' : ''),
      row('Долгих кадров (>34 мс)', probe.longFrames),
      row('Прилип к низу', list.isStuck ? 'да' : 'нет'),
    ].join('')
  }, 250)
  return probe
}
