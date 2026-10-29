import { Layout } from './layout.js'
import { hasPendingMedia, settleMedia } from './media.js'
import { ensureStyles } from './styles.js'

export type Key = string | number
export type Side = 'before' | 'after'
export type LoadSide = Side | 'range'
export type Origin = 'top' | 'bottom'
export type Mode = 'infinite' | 'virtual'
export type LoadState = 'idle' | 'loading' | 'done' | 'error'
export type Align = 'start' | 'center' | 'end'
export type LoadResult<T> = T[] | { items: T[], done?: boolean }
export type Loader<T> = (edge: T | undefined, side: Side) => LoadResult<T> | Promise<LoadResult<T>>
export type RangeResult<T> = T[] | { items: T[], total?: number }
export type RangeLoader<T> = (from: number, to: number) => RangeResult<T> | Promise<RangeResult<T>>

export interface VisibleRange<T> {
  first: T
  last: T
  firstIndex: number
  lastIndex: number
}

export interface InfinityScrollOptions<T> {
  getKey: (item: T) => Key
  render: (item: T, host: HTMLElement) => Node | void
  update?: (item: T, host: HTMLElement) => Node | void
  unmount?: (item: T, host: HTMLElement) => void
  commit?: () => unknown
  origin?: Origin
  mode?: Mode
  loadBefore?: Loader<T>
  loadAfter?: Loader<T>
  loadRange?: RangeLoader<T>
  total?: number
  pageSize?: number
  estimatedHeight?: number
  maxItems?: number
  items?: T[]
  hasBefore?: boolean
  hasAfter?: boolean
  anchor?: Key
  overscan?: number
  threshold?: number
  cacheSize?: number
  mediaTimeout?: number
  idleDelay?: number
  animate?: boolean | { duration?: number, easing?: string }
  renderLoader?: (side: Side) => Node | null
  onStickChange?: (stuck: boolean) => void
  onVisibleChange?: (range: VisibleRange<T> | null) => void
  onLoadStateChange?: (side: LoadSide, state: LoadState, error?: unknown) => void
}

export interface ResetOptions {
  hasBefore?: boolean
  hasAfter?: boolean
  anchor?: Key
  align?: Align
  total?: number
  index?: number
}

export interface ScrollOptions {
  behavior?: ScrollBehavior
  align?: Align
  offset?: number
}

export interface Stats {
  loaded: number
  total: number
  requests: number
  rendered: number
  cached: number
  created: number
  measured: number
  scrollWrites: number
  busyWrites: number
  shift: number
}

interface ItemNode {
  wrap: HTMLDivElement
  host: HTMLDivElement
}

interface Entry<T> {
  key: Key
  item: T
  height: number
  index: number
  count: number
  gap: boolean
  phase: number
  node: ItemNode | null
  attached: boolean
  stale: boolean
  waiting: boolean
}

interface Request {
  from: number
  to: number
}

interface FillSide<T> {
  comp: (e: Entry<T>, i: number) => boolean
  gaps: Entry<T>[]
}

type Zone = 'near' | 'visible' | 'far'
type Change<T> = [Entry<T>, number]

const EPS = 0.1
const MIN_ROW = 4
const MAX_REQUESTS = 4
const MAX_HEIGHT = 15_000_000

function snap(h: number): number {
  return Math.ceil(h - 0.02)
}
const SIDES: Side[] = ['before', 'after']

function div(className: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className
  return el
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function')
      requestIdleCallback(() => resolve(), { timeout: 400 })
    else
      setTimeout(resolve, 32)
  })
}

export class InfinityScroll<T> {
  readonly root: HTMLElement
  readonly viewport: HTMLDivElement
  readonly content: HTMLDivElement

  private o: InfinityScrollOptions<T>
  private bottom: boolean
  private virtual: boolean
  private near: Side
  private far: Side
  private spacerBefore: HTMLDivElement
  private spacerAfter: HTMLDivElement
  private measurer: HTMLDivElement
  private loaders: Partial<Record<Side, HTMLElement>> = {}
  private layout = new Layout<Entry<T>>()
  private keys = new Map<Key, Entry<T>>()
  private hosts = new WeakMap<Element, Entry<T>>()
  private cache = new Set<Entry<T>>()
  private rs = 0
  private re = 0
  private spacerSizes: [number, number] = [-1, -1]
  private padStart = 0
  private padEnd = 0
  private vh = 0
  private width = 0
  private more: Record<Side, boolean>
  private state: Record<LoadSide, LoadState> = { before: 'idle', after: 'idle', range: 'idle' }
  private cooldown: Record<Side, number> = { before: 0, after: 0 }
  private queue: Record<Side, Entry<T>[]> = { before: [], after: [] }
  private chain: Record<Side, Promise<unknown>> = { before: Promise.resolve(), after: Promise.resolve() }
  private pending = new Map<Entry<T>, number>()
  private active = false
  private touching = false
  private pressing = false
  private idleTimer = 0
  private staleTimer = 0
  private retryTimer = 0
  private expect: number | null = null
  private gen = 0
  private stuck = true
  private visible: [number, number, Entry<T> | null, Entry<T> | null] = [-1, -1, null, null]
  private structGen = 0
  private rowVar = 0
  private pattern = 0
  private seen: [number, number, number] | null = null
  private pin: { row: number, align: Align } | null = null
  private requests: Request[] = []
  private rangeCooldown = 0
  private rangeTimer = 0
  private trail: Array<[number, number]> = []
  private loadMs = 800
  private sumH = 0
  private sumN = 0
  private destroyed = false
  private dirtyCommit = false
  private inObserver = false
  private toObserve: HTMLElement[] = []
  private observeFrame = 0
  private remeasuring = false
  private fontsReady: Promise<unknown>
  private sized: Promise<void> = Promise.resolve()
  private onSized: (() => void) | null = null
  private ro: ResizeObserver
  private vro: ResizeObserver
  private counters = { requests: 0, created: 0, measured: 0, scrollWrites: 0, busyWrites: 0, shift: 0 }

  constructor(root: HTMLElement, options: InfinityScrollOptions<T>) {
    this.root = root
    this.o = options
    this.bottom = options.origin === 'bottom'
    this.virtual = (options.mode ?? (options.loadRange ? 'virtual' : 'infinite')) === 'virtual'
    this.near = this.bottom ? 'after' : 'before'
    this.far = this.bottom ? 'before' : 'after'
    const base = this.baseMore()
    this.more = { before: options.hasBefore ?? base.before, after: options.hasAfter ?? base.after }

    ensureStyles(root.ownerDocument)
    root.classList.add('eds')
    root.dataset.origin = this.bottom ? 'bottom' : 'top'
    root.dataset.mode = this.virtual ? 'virtual' : 'infinite'

    this.viewport = div('eds-viewport')
    this.viewport.tabIndex = 0
    this.content = div('eds-content')
    this.spacerBefore = div('eds-spacer')
    this.spacerAfter = div('eds-spacer')
    this.content.append(this.spacerBefore, this.spacerAfter)
    this.viewport.append(this.content)
    this.measurer = div('eds-content eds-measure')
    this.measurer.setAttribute('aria-hidden', 'true')
    root.append(this.viewport, this.measurer)

    for (const side of SIDES) {
      if (!this.loaderOf(side))
        continue
      const el = div('eds-loader')
      el.dataset.side = side
      const custom = options.renderLoader?.(side)
      el.append(custom === undefined ? div('eds-spinner') : custom ?? '')
      root.append(el)
      this.loaders[side] = el
    }

    const v = this.viewport
    v.addEventListener('scroll', this.onScroll, { passive: true })
    v.addEventListener('wheel', this.onWheel, { passive: true })
    v.addEventListener('touchstart', this.onTouchStart, { passive: true })
    v.addEventListener('touchend', this.onTouchEnd, { passive: true })
    v.addEventListener('touchcancel', this.onTouchEnd, { passive: true })
    v.addEventListener('pointerdown', this.onPointerDown, { passive: true })
    v.addEventListener('keydown', this.onKey, { passive: true })
    window.addEventListener('pointerup', this.onPointerUp, { passive: true })
    window.addEventListener('pointercancel', this.onPointerUp, { passive: true })

    this.ro = new ResizeObserver(this.onItemsResize)
    this.vro = new ResizeObserver(this.onViewportResize)
    this.vro.observe(this.viewport)
    this.readMetrics()
    if (!this.width)
      this.sized = new Promise(resolve => this.onSized = resolve)

    const fonts = root.ownerDocument.fonts
    this.fontsReady = fonts ? fonts.ready.catch(() => {}) : Promise.resolve()
    fonts?.addEventListener('loadingdone', this.onFonts)

    if (this.virtual)
      void this.reset(options.items, { total: options.total, anchor: options.anchor })
    else if (options.items?.length)
      void this.reset(options.items, { hasBefore: options.hasBefore, hasAfter: options.hasAfter, anchor: options.anchor })
    else
      this.sync()
  }

  get mode(): Mode {
    return this.virtual ? 'virtual' : 'infinite'
  }

  get items(): T[] {
    const out: T[] = []
    for (const e of this.layout.list) {
      if (!e.gap)
        out.push(e.item)
    }
    return out
  }

  get size(): number {
    return this.keys.size
  }

  get total(): number {
    return this.layout.rows()
  }

  get isStuck(): boolean {
    return this.stuck
  }

  get loadState(): Record<LoadSide, LoadState> {
    return { ...this.state }
  }

  get hasMore(): Record<Side, boolean> {
    return { ...this.more }
  }

  get stats(): Stats {
    return {
      loaded: this.keys.size,
      total: this.layout.rows(),
      rendered: this.re - this.rs,
      cached: this.cache.size,
      ...this.counters,
    }
  }

  has(key: Key): boolean {
    return this.keys.has(key)
  }

  get(key: Key): T | undefined {
    return this.keys.get(key)?.item
  }

  append(items: T[]): Promise<void> {
    return this.add('after', items)
  }

  prepend(items: T[]): Promise<void> {
    return this.add('before', items)
  }

  update(key: Key, item?: T): boolean {
    const e = this.keys.get(key)
    if (!e)
      return false
    if (item !== undefined)
      e.item = item
    if (e.node) {
      const host = e.node.host
      if (this.o.update) {
        const out = this.o.update(e.item, host)
        if (out)
          host.replaceChildren(out)
      }
      else {
        this.o.unmount?.(e.item, host)
        host.replaceChildren()
        const out = this.o.render(e.item, host)
        if (out)
          host.append(out)
      }
      this.dirtyCommit = true
      this.flushCommit()
    }
    if (!e.attached) {
      e.stale = true
      this.scheduleRemeasure()
    }
    return true
  }

  remove(key: Key): boolean {
    const e = this.keys.get(key)
    if (!e)
      return false
    const p0 = this.getPos()
    const v0 = this.viewTop(p0)
    const zone = this.zoneOf(e, v0)
    const gaps = zone === 'near' ? this.nearGaps(v0) : []
    const i = this.layout.indexOf(e)
    if (this.pin && i >= 0 && this.layout.rowOf(i) < this.pin.row)
      this.pin.row--
    this.destroyNode(e)
    this.keys.delete(key)
    this.pending.delete(e)
    this.structGen++
    if (i >= 0) {
      this.layout.remove(i)
      if (i < this.rs) {
        this.rs--
        this.re--
      }
      else if (i < this.re) {
        this.re--
      }
    }
    const rest = zone === 'near' ? this.absorb(-e.height, gaps) : 0
    this.refreshSpacers()
    if (rest !== 0)
      this.setPos(p0 + rest)
    this.flushCommit()
    this.sync()
    return true
  }

  async reset(items: T[] = [], options: ResetOptions = {}): Promise<void> {
    if (this.virtual)
      return this.resetRows(items, options)
    const gen = ++this.gen
    const entries = items.length ? await this.measure(this.fresh(items, false), true) : []
    if (gen !== this.gen || this.destroyed) {
      entries.forEach(e => this.destroyNode(e))
      return
    }
    this.clear()
    const base = this.baseMore()
    this.more.before = options.hasBefore ?? base.before
    this.more.after = options.hasAfter ?? base.after
    for (const e of entries) {
      this.keys.set(e.key, e)
      this.cache.add(e)
    }
    this.layout.insert(0, entries)
    this.refreshSpacers()
    const anchor = options.anchor !== undefined ? this.keys.get(options.anchor) : undefined
    if (anchor)
      this.setPos(this.posFor(anchor, options.align ?? 'center', 0))
    else
      this.setPos(0)
    this.sync()
  }

  private async resetRows(items: T[], options: ResetOptions): Promise<void> {
    const gen = ++this.gen
    const start = Math.max(0, Math.floor(options.index ?? 0))
    const entries = items.length ? await this.measure(this.fresh(items, false), true) : []
    if (gen !== this.gen || this.destroyed) {
      entries.forEach(e => this.destroyNode(e))
      return
    }
    const prev = this.layout.rows()
    this.clear()
    this.structGen++
    this.more.before = false
    this.more.after = false
    const known = options.total ?? (prev || this.o.total)
    const filled = entries.length ? start + entries.length : 0
    const t = known !== undefined ? Math.max(known, filled) : filled
    if (t > 0)
      this.layout.insert(0, [this.makeGap(t, this.gapHeight(t))])
    this.refreshSpacers()
    if (entries.length)
      this.fillRows(start, entries)
    const anchor = options.anchor !== undefined ? this.keys.get(options.anchor) : undefined
    if (anchor)
      this.setPos(this.posFor(anchor, options.align ?? 'center', 0))
    else if (options.index !== undefined && t > 0) {
      const row = Math.min(start, t - 1)
      this.pin = { row, align: options.align ?? 'start' }
      this.setPos(this.rowPos(row, this.pin.align, 0))
    }
    else
      this.setPos(0)
    this.sync()
  }

  private rowPos(index: number, align: Align, offset: number): number {
    const L = this.layout
    const i = L.indexAtRow(index)
    const e = L.list[i]
    let y = this.padStart + L.offset(i)
    let h = e.height
    if (e.gap) {
      h = e.height / e.count
      y += Math.round((index - L.rowOf(i)) * h)
    }
    return this.posAt(y, h, align, offset)
  }

  scrollToKey(key: Key, options: ScrollOptions = {}): boolean {
    const e = this.keys.get(key)
    if (!e)
      return false
    this.pin = null
    this.scrollToPos(this.posFor(e, options.align ?? 'center', options.offset ?? 0), options.behavior)
    return true
  }

  scrollToIndex(index: number, options: ScrollOptions = {}): boolean {
    if (!Number.isFinite(index) || index < 0 || index >= this.layout.rows())
      return false
    const row = Math.floor(index)
    const align = options.align ?? 'center'
    this.pin = this.virtual ? { row, align } : null
    this.scrollToPos(this.rowPos(row, align, options.offset ?? 0), options.behavior)
    return true
  }

  indexOfKey(key: Key): number {
    const e = this.keys.get(key)
    const i = e ? this.layout.indexOf(e) : -1
    return i < 0 ? -1 : this.layout.rowOf(i)
  }

  scrollToTop(options: ScrollOptions = {}): void {
    this.scrollToEdge('before', options.behavior)
  }

  scrollToBottom(options: ScrollOptions = {}): void {
    this.scrollToEdge('after', options.behavior)
  }

  refresh(): void {
    this.readMetrics()
    this.markStale()
    this.sync()
  }

  debug(): { model: number, dom: number, mismatched: number } {
    let mismatched = 0
    for (let i = this.rs; i < this.re; i++) {
      const e = this.layout.list[i]
      if (!e?.node || e.gap || this.pending.has(e) || e.waiting)
        continue
      if (snap(e.node.host.getBoundingClientRect().height) !== e.height)
        mismatched++
    }
    return {
      model: this.padStart + this.layout.total() + this.padEnd,
      dom: this.content.offsetHeight,
      mismatched,
    }
  }

  destroy(): void {
    if (this.destroyed)
      return
    this.destroyed = true
    this.gen++
    clearTimeout(this.idleTimer)
    clearTimeout(this.staleTimer)
    clearTimeout(this.retryTimer)
    clearTimeout(this.rangeTimer)
    cancelAnimationFrame(this.observeFrame)
    this.ro.disconnect()
    this.vro.disconnect()
    const v = this.viewport
    v.removeEventListener('scroll', this.onScroll)
    v.removeEventListener('wheel', this.onWheel)
    v.removeEventListener('touchstart', this.onTouchStart)
    v.removeEventListener('touchend', this.onTouchEnd)
    v.removeEventListener('touchcancel', this.onTouchEnd)
    v.removeEventListener('pointerdown', this.onPointerDown)
    v.removeEventListener('keydown', this.onKey)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    this.root.ownerDocument.fonts?.removeEventListener('loadingdone', this.onFonts)
    for (const e of this.layout.list)
      this.destroyNode(e)
    for (const side of SIDES) {
      for (const e of this.queue[side])
        this.destroyNode(e)
    }
    this.layout.clear()
    this.keys.clear()
    this.viewport.remove()
    this.measurer.remove()
    for (const side of SIDES)
      this.loaders[side]?.remove()
    this.root.classList.remove('eds')
    delete this.root.dataset.origin
    delete this.root.dataset.mode
    this.root.style.removeProperty('--eds-row')
  }

  private baseMore(): Record<Side, boolean> {
    const more = { before: false, after: false }
    more[this.far] = !!this.loaderOf(this.far)
    return more
  }

  private loaderOf(side: Side): Loader<T> | undefined {
    if (this.virtual)
      return undefined
    return side === 'before' ? this.o.loadBefore : this.o.loadAfter
  }

  private fresh(items: T[], skipKnown: boolean): T[] {
    const seen = new Set<Key>()
    const out: T[] = []
    for (const item of items) {
      const key = this.o.getKey(item)
      if (seen.has(key) || (skipKnown && this.keys.has(key)))
        continue
      seen.add(key)
      out.push(item)
    }
    return out
  }

  private add(side: Side, items: T[]): Promise<void> {
    const run = async () => {
      if (this.destroyed || this.more[side])
        return
      const gen = this.gen
      const list = this.fresh(items, true)
      if (!list.length)
        return
      const wait = !(side === this.near && this.isStuckLive())
      const entries = await this.measure(list, wait)
      if (gen !== this.gen || this.destroyed || this.more[side]) {
        entries.forEach(e => this.destroyNode(e))
        return
      }
      this.insert(side, entries.filter(e => !this.keys.has(e.key)))
    }
    const next = this.chain[side].then(run, run)
    this.chain[side] = next
    return next
  }

  private async measure(items: T[], wait: boolean): Promise<Entry<T>[]> {
    await this.fontsReady
    await this.sized
    if (this.destroyed)
      return []
    const entries: Entry<T>[] = items.map(item => ({
      key: this.o.getKey(item),
      item,
      height: 0,
      index: -1,
      count: 1,
      gap: false,
      phase: Number.NaN,
      node: null,
      attached: false,
      stale: false,
      waiting: false,
    }))
    const frag = document.createDocumentFragment()
    for (const e of entries)
      frag.append(this.createNode(e).wrap)
    this.measurer.append(frag)
    this.dirtyCommit = true
    await this.flushCommit()
    if (wait)
      await settleMedia(entries.map(e => e.node!.host), this.o.mediaTimeout ?? 1500)
    const live = entries.filter(e => e.node)
    for (const e of live) {
      e.height = snap(e.node!.host.getBoundingClientRect().height)
      this.sumH += e.height
      this.sumN++
    }
    for (const e of live) {
      if (e.node!.wrap.parentNode === this.measurer)
        e.node!.wrap.remove()
    }
    this.counters.measured += live.length
    return live
  }

  private insert(side: Side, entries: Entry<T>[]): void {
    if (!entries.length)
      return
    if (side === this.far)
      return this.insertNow(side, entries, false, false)
    if (this.isStuckLive())
      return this.insertNow(side, entries, false, true)
    if (this.isBusy()) {
      const d = entries.reduce((s, e) => s + e.height, 0)
      if (!this.virtual || d > this.room(this.nearGaps(this.viewTop()))) {
        this.queue[side].push(...entries)
        return
      }
    }
    this.insertNow(side, entries, true, false)
  }

  private insertNow(side: Side, entries: Entry<T>[], correct: boolean, animate: boolean): void {
    const fresh = entries.filter(e => !this.keys.has(e.key))
    for (const e of entries) {
      if (!fresh.includes(e))
        this.destroyNode(e)
    }
    if (!fresh.length)
      return
    const p0 = this.getPos()
    const gaps = correct ? this.nearGaps(this.viewTop(p0)) : []
    let d = 0
    for (const e of fresh) {
      d += e.height
      this.keys.set(e.key, e)
      this.cache.add(e)
    }
    if (side === 'before') {
      this.layout.insert(0, fresh)
      this.structGen++
      if (this.pin)
        this.pin.row += fresh.length
      if (this.re > 0) {
        this.rs += fresh.length
        this.re += fresh.length
      }
    }
    else {
      this.layout.insert(this.layout.length, fresh)
    }
    const rest = correct ? this.absorb(d, gaps) : 0
    this.refreshSpacers()
    if (rest !== 0)
      this.setPos(p0 + rest)
    if (animate)
      this.slide(d)
    this.sync()
  }

  private slide(d: number): void {
    const a = this.o.animate ?? true
    if (!a || d <= 0 || typeof this.content.animate !== 'function')
      return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      return
    const cfg = typeof a === 'object' ? a : {}
    const shift = this.bottom ? d : -d
    this.content.animate(
      [{ transform: `translateY(${shift}px)` }, { transform: 'translateY(0)' }],
      { duration: cfg.duration ?? 260, easing: cfg.easing ?? 'cubic-bezier(.22,.9,.3,1)', composite: 'add' },
    )
  }

  private clear(): void {
    for (const e of this.layout.list)
      this.destroyNode(e)
    for (const side of SIDES) {
      for (const e of this.queue[side])
        this.destroyNode(e)
      this.queue[side] = []
      this.setState(side, 'idle')
      this.cooldown[side] = 0
    }
    this.cache.clear()
    this.layout.clear()
    this.keys.clear()
    this.pending.clear()
    this.requests = []
    this.trail = []
    this.pin = null
    this.seen = null
    clearTimeout(this.rangeTimer)
    this.rangeTimer = 0
    this.rangeCooldown = 0
    this.setState('range', 'idle')
    this.rs = 0
    this.re = 0
    this.visible = [-1, -1, null, null]
    for (const anim of this.content.getAnimations?.() ?? [])
      anim.cancel()
    this.refreshSpacers()
    this.flushCommit()
  }

  private createNode(e: Entry<T>): ItemNode {
    const wrap = div('eds-item')
    const host = div('eds-host')
    wrap.append(host)
    const out = this.o.render(e.item, host)
    if (out)
      host.append(out)
    e.node = { wrap, host }
    this.hosts.set(host, e)
    this.counters.created++
    this.dirtyCommit = true
    return e.node
  }

  private destroyNode(e: Entry<T>): void {
    this.cache.delete(e)
    const node = e.node
    if (!node)
      return
    if (e.gap) {
      node.wrap.remove()
      e.node = null
      e.attached = false
      return
    }
    this.ro.unobserve(node.host)
    node.wrap.remove()
    this.hosts.delete(node.host)
    e.node = null
    e.attached = false
    this.o.unmount?.(e.item, node.host)
    this.dirtyCommit = true
  }

  private attach(e: Entry<T>): HTMLDivElement {
    if (e.gap) {
      if (!e.node) {
        const el = div('eds-gap')
        el.setAttribute('aria-hidden', 'true')
        e.node = { wrap: el, host: el }
        e.phase = Number.NaN
      }
      this.paintGap(e)
      e.attached = true
      return e.node.wrap
    }
    const node = e.node ?? this.createNode(e)
    node.wrap.style.height = `${e.height}px`
    this.cache.delete(e)
    e.attached = true
    this.observe(node.host)
    return node.wrap
  }

  private observe(host: HTMLElement): void {
    if (!this.inObserver) {
      this.ro.observe(host)
      return
    }
    this.toObserve.push(host)
    if (!this.observeFrame)
      this.observeFrame = requestAnimationFrame(this.flushObserve)
  }

  private flushObserve = (): void => {
    this.observeFrame = 0
    for (const host of this.toObserve.splice(0)) {
      const e = this.hosts.get(host)
      if (e?.attached && e.node?.host === host)
        this.ro.observe(host)
    }
  }

  private detach(e: Entry<T>): void {
    if (!e.node)
      return
    if (e.gap)
      return this.destroyNode(e)
    this.ro.unobserve(e.node.host)
    e.node.wrap.remove()
    e.attached = false
    this.cache.add(e)
  }

  private trimCache(): void {
    const max = this.o.cacheSize ?? 400
    for (const e of this.cache) {
      if (this.cache.size <= max)
        break
      this.destroyNode(e)
    }
  }

  private flushCommit(): Promise<void> | void {
    if (!this.dirtyCommit || this.destroyed)
      return
    this.dirtyCommit = false
    const r = this.o.commit?.()
    if (r && typeof (r as Promise<unknown>).then === 'function')
      return (r as Promise<unknown>).then(() => {})
  }

  private setRange(ns: number, ne: number): void {
    const list = this.layout.list
    const { rs, re } = this
    if (ns === rs && ne === re)
      return
    if (rs === re || ne <= rs || ns >= re) {
      for (let i = rs; i < re; i++)
        this.detach(list[i])
      const frag = document.createDocumentFragment()
      for (let i = ns; i < ne; i++)
        frag.append(this.attach(list[i]))
      this.spacerAfter.before(frag)
    }
    else {
      for (let i = rs; i < ns; i++)
        this.detach(list[i])
      for (let i = ne; i < re; i++)
        this.detach(list[i])
      if (ns < rs) {
        const frag = document.createDocumentFragment()
        for (let i = ns; i < rs; i++)
          frag.append(this.attach(list[i]))
        this.spacerBefore.after(frag)
      }
      if (ne > re) {
        const frag = document.createDocumentFragment()
        for (let i = re; i < ne; i++)
          frag.append(this.attach(list[i]))
        this.spacerAfter.before(frag)
      }
    }
    this.rs = ns
    this.re = ne
    this.refreshSpacers()
    this.trimCache()
    this.flushCommit()
  }

  private refreshSpacers(): void {
    const L = this.layout
    const a = L.offset(this.rs)
    const b = L.total() - L.offset(this.re)
    if (a !== this.spacerSizes[0]) {
      this.spacerSizes[0] = a
      this.spacerBefore.style.height = `${a}px`
    }
    if (b !== this.spacerSizes[1]) {
      this.spacerSizes[1] = b
      this.spacerAfter.style.height = `${b}px`
    }
  }

  private contentHeight(): number {
    return this.padStart + this.layout.total() + this.padEnd
  }

  private maxPos(): number {
    return Math.max(0, this.contentHeight() - this.vh)
  }

  private getPos(): number {
    const t = this.viewport.scrollTop
    return Math.max(0, this.bottom ? -t : t)
  }

  private setPos(p: number): void {
    const pos = Math.min(Math.max(0, p), this.maxPos())
    const before = this.getPos()
    this.expect = pos
    this.counters.scrollWrites++
    if (this.isBusy())
      this.counters.busyWrites++
    this.viewport.scrollTop = this.bottom ? -pos : pos
    this.counters.shift += this.getPos() - before
  }

  private viewTop(pos = this.getPos()): number {
    return this.bottom ? this.contentHeight() - pos - this.vh : pos
  }

  private zoneOf(e: Entry<T>, v0 = this.viewTop()): Zone {
    const L = this.layout
    const i = L.indexOf(e)
    if (i < 0)
      return 'far'
    const y0 = this.padStart + L.offset(i)
    const y1 = y0 + e.height
    const v1 = v0 + this.vh
    if (this.bottom)
      return y0 >= v1 ? 'near' : y1 <= v0 ? 'far' : 'visible'
    return y1 <= v0 ? 'near' : y0 >= v1 ? 'far' : 'visible'
  }

  private posFor(e: Entry<T>, align: Align, offset: number): number {
    const L = this.layout
    return this.posAt(this.padStart + L.offset(L.indexOf(e)), e.height, align, offset)
  }

  private posAt(y: number, h: number, align: Align, offset: number): number {
    const top = align === 'start'
      ? y - offset
      : align === 'end'
        ? y + h - this.vh + offset
        : y + h / 2 - this.vh / 2
    const max = this.maxPos()
    const clamped = Math.min(Math.max(0, top), max)
    return this.bottom ? max - clamped : clamped
  }

  private scrollToPos(pos: number, behavior: ScrollBehavior = 'auto'): void {
    const target = Math.min(Math.max(0, pos), this.maxPos())
    if (behavior !== 'smooth') {
      this.setPos(target)
      this.sync()
      return
    }
    const cur = this.getPos()
    const lead = this.vh * 1.5
    if (Math.abs(cur - target) > lead * 1.4) {
      this.setPos(target + Math.sign(cur - target) * lead)
      this.sync()
    }
    this.viewport.scrollTo({ top: this.bottom ? -target : target, behavior: 'smooth' })
  }

  private scrollToEdge(side: Side, behavior?: ScrollBehavior): void {
    this.pin = null
    if (side === this.near && this.more[this.near]) {
      void this.reset()
      return
    }
    this.scrollToPos(side === this.near ? 0 : this.maxPos(), behavior)
  }

  private isBusy(): boolean {
    return this.active || this.touching || this.pressing
  }

  private isStuckLive(): boolean {
    return !this.more[this.near] && this.getPos() <= 2
  }

  private applyHeights(changes: Array<Change<T>>, deferred: boolean): void {
    const now: Array<Change<T>> = []
    const busy = this.isBusy()
    const p0 = this.getPos()
    const v0 = this.viewTop(p0)
    const pin = this.pinSide()
    const gaps = pin ? pin.gaps : this.nearGaps(v0)
    const room = this.room(gaps)
    let corr = 0
    for (const [e, h] of changes) {
      if (this.keys.get(e.key) !== e)
        continue
      const zone = this.zoneOf(e, v0)
      const d = h - e.height
      if (!deferred && zone === 'near' && busy && !(gaps.length && corr + d <= room)) {
        this.pending.set(e, h)
        continue
      }
      this.pending.delete(e)
      if (pin ? pin.comp(e, this.layout.indexOf(e)) : zone === 'near' || (deferred && zone === 'visible'))
        corr += d
      now.push([e, h])
    }
    if (!now.length)
      return
    for (const [e, h] of now) {
      this.layout.setHeight(e, h)
      e.stale = false
      if (e.attached && e.node)
        e.node.wrap.style.height = `${h}px`
    }
    const rest = this.absorb(corr, gaps)
    this.refreshSpacers()
    if (rest !== 0)
      this.setPos(p0 + rest)
  }

  private nearGaps(v0: number): Entry<T>[] {
    const out: Entry<T>[] = []
    const L = this.layout
    const list = L.list
    const n = list.length
    if (!this.virtual || !n)
      return out
    const pad = this.padStart
    if (this.bottom) {
      const v1 = v0 + this.vh
      for (let i = L.indexAt(v1 - pad); i < n; i++) {
        const e = list[i]
        if (e.gap && pad + L.offset(i) >= v1)
          out.push(e)
      }
    }
    else {
      for (let i = L.indexAt(v0 - pad); i >= 0; i--) {
        const e = list[i]
        if (e.gap && pad + L.offset(i) + e.height <= v0)
          out.push(e)
      }
    }
    return out
  }

  private gapsToward(a: number): Entry<T>[] {
    const out: Entry<T>[] = []
    const list = this.layout.list
    if (this.bottom) {
      for (let i = a + 1; i < list.length; i++) {
        if (list[i].gap)
          out.push(list[i])
      }
    }
    else {
      for (let i = a - 1; i >= 0; i--) {
        if (list[i].gap)
          out.push(list[i])
      }
    }
    return out
  }

  private room(gaps: Entry<T>[]): number {
    let s = 0
    for (const g of gaps)
      s += Math.max(0, g.height - g.count * MIN_ROW)
    return s
  }

  private absorb(delta: number, gaps: Entry<T>[]): number {
    let need = delta
    for (const g of gaps) {
      if (need === 0)
        break
      if (this.layout.indexOf(g) < 0)
        continue
      const take = need > 0 ? Math.min(need, g.height - g.count * MIN_ROW) : need
      if (take <= 0 && need > 0)
        continue
      this.setGapHeight(g, g.height - take)
      need -= take
    }
    return need
  }

  private setGapHeight(g: Entry<T>, h: number): void {
    this.layout.setHeight(g, h)
    if (g.node)
      this.paintGap(g)
  }

  private paintGap(g: Entry<T>): void {
    g.node!.wrap.style.height = `${g.height}px`
  }

  private paintPattern(pos: number): void {
    const shift = this.counters.shift
    const ch = this.contentHeight()
    const vt = this.viewTop(pos)
    if (this.seen) {
      const [p0, s0, h0] = this.seen
      const user = (pos - p0) - (shift - s0)
      const expected = this.bottom ? h0 - (p0 + user) - this.vh : p0 + user
      this.pattern += vt - expected
    }
    this.seen = [pos, shift, ch]
    const row = this.rowVar || 64
    const L = this.layout
    for (let i = this.rs; i < this.re; i++) {
      const e = L.list[i]
      if (!e?.gap || !e.node)
        continue
      const y = this.padStart + L.offset(i)
      const ph = (((this.pattern - y) % row) + row) % row
      if (Math.abs(ph - e.phase) < 0.5)
        continue
      e.phase = ph
      e.node.wrap.style.backgroundPositionY = `${Math.round(ph)}px`
    }
  }

  private paintRow(v0: number, v1: number): void {
    const r = Math.max(16, Math.round(this.est()))
    if (this.rowVar && Math.abs(r - this.rowVar) < 4)
      return
    const L = this.layout
    for (let i = this.rs; i < this.re; i++) {
      const e = L.list[i]
      const y0 = L.offset(i)
      if (e?.gap && y0 < v1 && y0 + e.height > v0)
        return
    }
    this.rowVar = r
    this.root.style.setProperty('--eds-row', `${r}px`)
    for (const e of this.layout.list) {
      if (e.gap)
        e.phase = Number.NaN
    }
  }

  private sync = (): void => {
    if (this.destroyed)
      return
    this.flushVisiblePending()
    this.flushEdgeQueue()

    const L = this.layout
    const n = L.length
    const pos = this.getPos()
    const v0 = this.viewTop(pos) - this.padStart
    const v1 = v0 + this.vh

    if (n === 0) {
      this.setRange(0, 0)
    }
    else {
      const ov = this.o.overscan ?? Math.max(this.vh, 400)
      const total = L.total()
      const lo = Math.max(0, v0 - ov / 2)
      const hi = Math.min(total, v1 + ov / 2)
      const a = L.offset(this.rs)
      const b = L.offset(this.re)
      const ok = this.rs < this.re && a <= lo && b >= hi && a >= v0 - ov * 3 && b <= v1 + ov * 3
      if (!ok)
        this.setRange(L.indexAt(v0 - ov), Math.min(n, L.indexAt(v1 + ov) + 1))
    }

    const stuck = !this.more[this.near] && pos <= 2
    if (stuck !== this.stuck) {
      this.stuck = stuck
      this.o.onStickChange?.(stuck)
    }

    this.emitVisible(v0, v1)
    if (this.virtual) {
      this.paintRow(v0, v1)
      this.paintPattern(pos)
      this.checkRange(v0, v1)
    }
    else
      this.checkLoad(v0 + this.padStart)
  }

  private flushVisiblePending(): void {
    if (!this.pending.size)
      return
    const hits: Array<[Entry<T>, number]> = []
    const v0 = this.viewTop()
    for (const [e, h] of this.pending) {
      if (this.zoneOf(e, v0) !== 'near')
        hits.push([e, h])
    }
    if (hits.length)
      this.applyHeights(hits, true)
  }

  private flushEdgeQueue(): void {
    const q = this.queue[this.near]
    if (!q.length || this.getPos() > 1)
      return
    this.queue[this.near] = []
    const live = !this.more[this.near]
    this.insertNow(this.near, q, !live, live)
  }

  private flushDeferred(): void {
    if (this.pending.size) {
      const all = [...this.pending]
      this.pending.clear()
      this.applyHeights(all, true)
    }
    for (const side of SIDES) {
      const q = this.queue[side]
      if (!q.length)
        continue
      this.queue[side] = []
      const live = side === this.near && this.isStuckLive()
      this.insertNow(side, q, !live, live)
    }
    if (this.virtual) {
      this.rescaleFar()
      this.trimLoaded()
    }
    this.sync()
  }

  private emitVisible(v0: number, v1: number): void {
    if (!this.o.onVisibleChange)
      return
    const L = this.layout
    const list = L.list
    const n = L.length
    let a = n ? L.indexAt(Math.max(0, v0)) : 0
    let b = n ? L.indexAt(Math.max(0, v1 - 1)) : -1
    while (a <= b && list[a].gap)
      a++
    while (b >= a && list[b].gap)
      b--
    const first = a <= b ? list[a] : null
    const last = a <= b ? list[b] : null
    const ra = first ? L.rowOf(a) : -1
    const rb = last ? L.rowOf(b) : -1
    const [pa, pb, pf, pl] = this.visible
    if (ra === pa && rb === pb && first === pf && last === pl)
      return
    this.visible = [ra, rb, first, last]
    this.o.onVisibleChange(first && last
      ? { first: first.item, last: last.item, firstIndex: ra, lastIndex: rb }
      : null)
  }

  private threshold(): number {
    return this.o.threshold ?? (this.virtual ? Math.max(this.vh * 4, 2400) : Math.max(this.vh * 2, 1200))
  }

  private pageSize(): number {
    return Math.max(1, this.o.pageSize ?? 50)
  }

  private est(): number {
    return this.sumN ? this.sumH / this.sumN : (this.o.estimatedHeight ?? 60)
  }

  private makeGap(count: number, height: number): Entry<T> {
    return {
      key: '',
      item: undefined as T,
      height,
      index: -1,
      count,
      gap: true,
      phase: Number.NaN,
      node: null,
      attached: false,
      stale: false,
      waiting: false,
    }
  }

  private rowEstimate(extra = 0): number {
    let rows = extra
    let loaded = 0
    for (const e of this.layout.list) {
      if (e.gap)
        rows += e.count
      else
        loaded += e.height
    }
    const est = this.est()
    if (!rows)
      return est
    return Math.max(MIN_ROW, Math.min(est, (MAX_HEIGHT - this.padStart - this.padEnd - loaded) / rows))
  }

  private gapHeight(count: number, per = this.rowEstimate(count)): number {
    return Math.max(count * MIN_ROW, Math.round(count * per))
  }

  private speed(): number {
    const now = performance.now()
    while (this.trail.length && now - this.trail[0][0] > 120)
      this.trail.shift()
    if (this.trail.length < 2)
      return 0
    return Math.abs(this.trail[this.trail.length - 1][1] - this.trail[0][1])
  }

  private velocity(): number {
    this.speed()
    const t = this.trail
    if (t.length < 2)
      return 0
    const [ta, pa] = t[0]
    const [tb, pb] = t[t.length - 1]
    const v = tb > ta ? (pb - pa) / (tb - ta) : 0
    return this.bottom ? -v : v
  }

  private checkRange(v0: number, v1: number): void {
    const load = this.o.loadRange
    if (!load || this.requests.length >= MAX_REQUESTS || performance.now() < this.rangeCooldown)
      return
    const L = this.layout
    const n = L.length
    const ps = this.pageSize()
    if (!n) {
      if (!this.requests.length)
        void this.loadRows(0, ps)
      return
    }
    const thr = this.threshold()
    const vel = this.velocity()
    const lead = Math.min(this.vh * 8, Math.abs(vel) * this.loadMs * 1.5)
    const lo = Math.max(0, v0 - thr - (vel < 0 ? lead : 0))
    const hi = v1 + thr + (vel > 0 ? lead : 0)
    const list = L.list
    const pages: Array<[number, number, number]> = []
    let seen = false
    for (let i = L.indexAt(lo); i < n; i++) {
      const y0 = L.offset(i)
      if (y0 >= hi)
        break
      const e = list[i]
      if (!e.gap)
        continue
      const y1 = y0 + e.height
      seen ||= y0 < v1 && y1 > v0
      const rh = e.height / e.count || 1
      const s = L.rowOf(i)
      const a = s + Math.min(e.count - 1, Math.max(0, Math.floor((Math.max(lo, y0) - y0) / rh)))
      const b = s + Math.min(e.count, Math.max(1, Math.ceil((Math.min(hi, y1) - y0) / rh)))
      for (let p = Math.floor(a / ps) * ps; p < b; p += ps) {
        const from = Math.max(s, p)
        const to = Math.min(s + e.count, p + ps)
        const py0 = y0 + (from - s) * rh
        const py1 = y0 + (to - s) * rh
        pages.push([from, to, py1 <= v0 ? v0 - py1 : py0 >= v1 ? py0 - v1 : 0])
      }
    }
    if (!pages.length)
      return
    if (seen && this.isBusy() && this.speed() > this.vh) {
      if (!this.rangeTimer)
        this.rangeTimer = window.setTimeout(() => {
          this.rangeTimer = 0
          this.sync()
        }, 120)
      return
    }
    pages.sort((x, y) => x[2] - y[2])
    for (const [from, to] of pages) {
      if (this.requests.length >= MAX_REQUESTS)
        break
      if (!this.requests.some(r => r.from < to && from < r.to))
        void this.loadRows(from, to)
    }
  }

  private async loadRows(from: number, to: number): Promise<void> {
    const load = this.o.loadRange
    if (!load)
      return
    const gen = this.gen
    const sg = this.structGen
    const req: Request = { from, to }
    this.requests.push(req)
    this.counters.requests++
    this.setState('range', 'loading')
    const t0 = performance.now()
    try {
      const res = await load(from, to)
      if (gen !== this.gen || this.destroyed)
        return
      const items = Array.isArray(res) ? res : res.items
      const total = Array.isArray(res) ? undefined : res.total
      const entries = items.length ? await this.measure(items, true) : []
      if (gen !== this.gen || this.destroyed || sg !== this.structGen) {
        entries.forEach(e => this.destroyNode(e))
        return
      }
      this.loadMs = this.loadMs * 0.7 + (performance.now() - t0) * 0.3
      this.applyTotal(from, to, items.length, total)
      this.fillRows(from, entries)
      this.rescaleFar()
      this.trimLoaded()
      this.paintPattern(this.getPos())
    }
    catch (error) {
      if (gen !== this.gen || this.destroyed)
        return
      this.rangeCooldown = performance.now() + 2000
      this.setState('range', 'error', error)
      clearTimeout(this.retryTimer)
      this.retryTimer = window.setTimeout(this.sync, 2050)
    }
    finally {
      const k = this.requests.indexOf(req)
      if (k >= 0)
        this.requests.splice(k, 1)
      if (gen === this.gen && !this.destroyed) {
        if (!this.requests.length && this.state.range === 'loading')
          this.setState('range', 'idle')
        this.flushCommit()
        requestAnimationFrame(this.sync)
      }
    }
  }

  private applyTotal(from: number, to: number, got: number, total: number | undefined): void {
    const rows = this.layout.rows() + this.queue.before.length + this.queue.after.length
    let t = total
    if (t === undefined)
      t = got < to - from ? from + got : Math.max(rows, from + got + this.pageSize())
    t = Math.max(0, Math.floor(t))
    if (t > rows)
      this.growTail(t - rows)
    else if (t < rows)
      this.shrinkTail(rows - t)
  }

  private tailCorrection(d: number, p0: number): void {
    if (d === 0 || !this.bottom || p0 <= 2)
      return
    this.setPos(p0 + d)
  }

  private growTail(count: number): void {
    const L = this.layout
    const list = L.list
    const last = list[list.length - 1]
    const p0 = this.getPos()
    const keep = this.bottom && p0 > 2
    if (last?.gap) {
      last.count += count
      this.setGapHeight(last, keep ? last.height : last.height + this.gapHeight(count))
      this.refreshSpacers()
      return
    }
    L.insert(L.length, [this.makeGap(count, keep ? 0 : this.gapHeight(count))])
    this.refreshSpacers()
  }

  private shrinkTail(count: number): void {
    const L = this.layout
    const p0 = this.getPos()
    let left = count
    let d = 0
    while (left > 0 && L.length) {
      const i = L.length - 1
      const g = L.list[i]
      if (!g.gap)
        break
      if (g.count <= left) {
        left -= g.count
        d += g.height
        this.destroyNode(g)
        L.remove(i)
        if (this.re > i)
          this.re = i
        if (this.rs > i)
          this.rs = i
        continue
      }
      const h = Math.round(g.height * (g.count - left) / g.count)
      d += g.height - h
      g.count -= left
      left = 0
      this.setGapHeight(g, h)
    }
    this.refreshSpacers()
    this.tailCorrection(-d, p0)
  }

  private fillRows(from: number, entries: Entry<T>[]): void {
    const L = this.layout
    const runs: Array<[number, Entry<T>[]]> = []
    const used = new Set<Entry<T>>()
    const seen = new Set<Key>()
    let run: Entry<T>[] | null = null
    let runGap: Entry<T> | null = null
    for (let k = 0; k < entries.length; k++) {
      const row = from + k
      const e = entries[k]
      if (row >= L.rows() || seen.has(e.key)) {
        run = null
        continue
      }
      seen.add(e.key)
      const g = L.list[L.indexAtRow(row)]
      if (!g.gap) {
        run = null
        continue
      }
      if (!run || runGap !== g) {
        run = []
        runGap = g
        runs.push([row, run])
      }
      run.push(e)
      used.add(e)
    }
    for (const e of entries) {
      if (!used.has(e))
        this.destroyNode(e)
    }
    for (const [, block] of runs) {
      for (const e of block) {
        const old = this.keys.get(e.key)
        if (old && old !== e)
          this.toGap(old)
      }
    }
    const changes: Array<Change<T>> = []
    for (const [row, block] of runs)
      this.splitGap(row, block, changes)
    this.refreshSpacers()
    this.applyFill(changes)
  }

  private splitGap(row: number, block: Entry<T>[], changes: Array<Change<T>>): void {
    const L = this.layout
    const i = L.indexAtRow(row)
    const g = L.list[i]
    if (!g?.gap)
      return
    const r0 = row - L.rowOf(i)
    const k = Math.min(block.length, g.count - r0)
    const C = g.count
    const H = g.height
    const y = (r: number) => Math.round(H * r / C)
    const parts: Entry<T>[] = []
    if (r0 > 0)
      parts.push(this.makeGap(r0, y(r0)))
    for (let j = 0; j < k; j++) {
      const e = block[j]
      changes.push([e, e.height])
      e.height = y(r0 + j + 1) - y(r0 + j)
      this.keys.set(e.key, e)
      this.cache.add(e)
      parts.push(e)
    }
    for (let j = k; j < block.length; j++)
      this.destroyNode(block[j])
    if (r0 + k < C)
      parts.push(this.makeGap(C - r0 - k, H - y(r0 + k)))
    L.replace(i, 1, parts)
    const delta = parts.length - 1
    if (i < this.rs) {
      this.rs += delta
      this.re += delta
    }
    else if (i < this.re) {
      const old = g.node?.wrap
      const frag = document.createDocumentFragment()
      for (const p of parts)
        frag.append(this.attach(p))
      if (old?.parentNode)
        old.replaceWith(frag)
      else
        this.spacerAfter.before(frag)
      g.node = null
      g.attached = false
      this.re += delta
    }
  }

  private toGap(e: Entry<T>): void {
    const L = this.layout
    const i = L.indexOf(e)
    this.keys.delete(e.key)
    this.pending.delete(e)
    if (i < 0) {
      this.destroyNode(e)
      return
    }
    const g = this.makeGap(1, e.height)
    const old = e.attached ? e.node?.wrap : undefined
    if (old?.parentNode)
      old.before(this.attach(g))
    this.destroyNode(e)
    L.replace(i, 1, [g])
  }

  private applyFill(changes: Array<Change<T>>): void {
    if (!changes.length)
      return
    const L = this.layout
    const p0 = this.getPos()
    const v0 = this.viewTop(p0)
    const fresh = new Set(changes.map(c => c[0]))
    const pin = this.pinSide()
    const live = !pin && this.isStuckLive()
    const side = pin ?? this.anchorSide(v0, fresh)
    const gaps = side ? side.gaps : this.nearGaps(v0)
    const comp: Array<Change<T>> = []
    const now: Array<Change<T>> = []
    let need = 0
    for (const c of changes) {
      const i = L.indexOf(c[0])
      const before = !live && (side ? side.comp(c[0], i) : this.zoneOf(c[0], v0) === 'near')
      if (before) {
        comp.push(c)
        need += c[1] - c[0].height
      }
      else {
        now.push(c)
      }
    }
    const fits = need === 0 || (gaps.length > 0 && need <= this.room(gaps))
    if (!fits && this.isBusy()) {
      for (const c of comp) {
        if (this.zoneOf(c[0], v0) === 'near') {
          this.pending.set(c[0], c[1])
          need -= c[1] - c[0].height
        }
        else {
          now.push(c)
        }
      }
    }
    else {
      now.push(...comp)
    }
    for (const [e, h] of now) {
      L.setHeight(e, h)
      if (e.attached && e.node)
        e.node.wrap.style.height = `${h}px`
    }
    const rest = this.absorb(need, gaps)
    this.refreshSpacers()
    if (rest !== 0)
      this.setPos(p0 + rest)
    this.reveal(changes.map(c => c[0]))
  }

  private reveal(entries: Entry<T>[]): void {
    const a = this.o.animate ?? true
    if (!a || typeof this.content.animate !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      return
    const L = this.layout
    const v0 = this.viewTop()
    const v1 = v0 + this.vh
    for (const e of entries) {
      if (!e.attached || !e.node || this.pending.has(e))
        continue
      const y0 = this.padStart + L.offset(L.indexOf(e))
      if (y0 < v1 && y0 + e.height > v0)
        e.node.wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })
    }
  }

  private pinSide(): FillSide<T> | null {
    const pin = this.pin
    const L = this.layout
    if (!pin || pin.row >= L.rows())
      return null
    const R = pin.row
    const self = pin.align === 'end' ? !this.bottom : this.bottom
    const comp = (e: Entry<T>, i: number) => {
      const s = L.rowOf(i)
      const end = s + e.count
      if (this.bottom)
        return s > R ? true : end <= R ? false : self
      return end <= R ? true : s > R ? false : self
    }
    const gaps: Entry<T>[] = []
    const list = L.list
    if (this.bottom) {
      for (let i = L.indexAtRow(R) + 1; i < list.length; i++) {
        if (list[i].gap)
          gaps.push(list[i])
      }
    }
    else {
      for (let i = L.indexAtRow(R) - 1; i >= 0; i--) {
        if (list[i].gap)
          gaps.push(list[i])
      }
    }
    return { comp, gaps }
  }

  private anchorSide(v0: number, fresh: Set<Entry<T>>): FillSide<T> | null {
    const a = this.anchorIndex(v0, fresh)
    if (a < 0)
      return null
    return { comp: (_e, i) => (this.bottom ? i > a : i < a), gaps: this.gapsToward(a) }
  }

  private anchorIndex(v0: number, skip: Set<Entry<T>>): number {
    const L = this.layout
    const list = L.list
    const n = list.length
    if (!n)
      return -1
    const pad = this.padStart
    const m = this.vh / 2
    const lo = v0 - m
    const hi = v0 + this.vh + m
    const mid = v0 + this.vh / 2
    let best = -1
    let dist = Number.POSITIVE_INFINITY
    for (let i = L.indexAt(Math.max(0, lo - pad)); i < n; i++) {
      const e = list[i]
      const y0 = pad + L.offset(i)
      if (y0 >= hi)
        break
      if (e.gap || skip.has(e) || y0 + e.height <= lo)
        continue
      const d = y0 > mid ? y0 - mid : y0 + e.height < mid ? mid - y0 - e.height : 0
      if (d < dist) {
        dist = d
        best = i
      }
    }
    return best
  }

  private rescaleFar(): void {
    if (this.pressing)
      return
    const v0 = this.viewTop()
    const per = this.rowEstimate()
    const far: Array<[Entry<T>, number]> = []
    for (const g of this.layout.list) {
      if (!g.gap)
        continue
      const h = this.gapHeight(g.count, per)
      if (Math.abs(h - g.height) >= 2 && this.zoneOf(g, v0) === 'far')
        far.push([g, h])
    }
    if (!far.length)
      return
    for (const [g, h] of far)
      this.setGapHeight(g, h)
    this.refreshSpacers()
  }

  private trimLoaded(): void {
    const max = this.o.maxItems ?? 1000
    if (this.keys.size <= max)
      return
    const L = this.layout
    const list = L.list
    const v0 = this.viewTop() - this.padStart
    const v1 = v0 + this.vh
    const ov = this.o.overscan ?? Math.max(this.vh, 400)
    const keep = Math.max(this.threshold(), ov * 3) + this.vh
    const cands: Array<[number, Entry<T>]> = []
    for (let i = 0; i < list.length; i++) {
      if (i >= this.rs && i < this.re)
        continue
      const e = list[i]
      if (e.gap)
        continue
      const y0 = L.offset(i)
      const y1 = y0 + e.height
      const dist = y1 <= v0 ? v0 - y1 : y0 >= v1 ? y0 - v1 : 0
      if (dist > keep)
        cands.push([dist, e])
    }
    cands.sort((x, y) => y[0] - x[0])
    const drop = new Set(cands.slice(0, this.keys.size - Math.floor(max * 0.8)).map(c => c[1]))
    if (!drop.size)
      return
    const first = this.rs < this.re ? list[this.rs] : null
    const next: Entry<T>[] = []
    let acc: Entry<T> | null = null
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      const rendered = i >= this.rs && i < this.re
      if (rendered || !(e.gap || drop.has(e))) {
        acc = null
        next.push(e)
        continue
      }
      if (!e.gap) {
        this.keys.delete(e.key)
        this.pending.delete(e)
        this.destroyNode(e)
      }
      if (acc) {
        acc.count += e.count
        acc.height += e.height
        if (e.gap)
          this.destroyNode(e)
        continue
      }
      acc = e.gap ? e : this.makeGap(e.count, e.height)
      next.push(acc)
    }
    const span = this.re - this.rs
    L.assign(next)
    if (first) {
      this.rs = L.indexOf(first)
      this.re = this.rs + span
    }
    for (let i = 0; i < next.length; i++) {
      const g = next[i]
      if (g.gap && g.node)
        this.paintGap(g)
    }
    this.refreshSpacers()
  }

  private checkLoad(top: number): void {
    const threshold = this.o.threshold ?? Math.max(this.vh * 2, 1200)
    const now = performance.now()
    for (const side of SIDES) {
      if (!this.more[side] || this.state[side] === 'loading' || this.queue[side].length || !this.loaderOf(side))
        continue
      if (now < this.cooldown[side])
        continue
      const dist = side === 'before' ? top : this.contentHeight() - top - this.vh
      if (dist < threshold)
        void this.load(side)
    }
  }

  private async load(side: Side): Promise<void> {
    const loader = this.loaderOf(side)
    if (!loader)
      return
    const gen = this.gen
    this.setState(side, 'loading')
    try {
      const list = this.layout.list
      const edge = side === 'before' ? list[0] : list[list.length - 1]
      const res = await loader(edge?.item, side)
      if (gen !== this.gen || this.destroyed)
        return
      const items = Array.isArray(res) ? res : res.items
      const done = Array.isArray(res) ? items.length === 0 : (res.done ?? items.length === 0)
      const fresh = this.fresh(items, true)
      const entries = fresh.length ? await this.measure(fresh, true) : []
      if (gen !== this.gen || this.destroyed) {
        entries.forEach(e => this.destroyNode(e))
        return
      }
      this.more[side] = !done && fresh.length > 0
      this.setState(side, this.more[side] ? 'idle' : 'done')
      this.insert(side, entries)
    }
    catch (error) {
      if (gen !== this.gen || this.destroyed)
        return
      this.cooldown[side] = performance.now() + 2000
      this.setState(side, 'error', error)
      clearTimeout(this.retryTimer)
      this.retryTimer = window.setTimeout(this.sync, 2050)
      return
    }
    requestAnimationFrame(this.sync)
  }

  private setState(side: LoadSide, state: LoadState, error?: unknown): void {
    const prev = this.state[side]
    this.state[side] = state
    const el = side === 'range' ? undefined : this.loaders[side]
    if (el)
      el.toggleAttribute('data-active', state === 'loading')
    if (prev !== state || state === 'error')
      this.o.onLoadStateChange?.(side, state, error)
  }

  private markActive(): void {
    this.active = true
    clearTimeout(this.idleTimer)
    this.idleTimer = window.setTimeout(this.onIdle, this.o.idleDelay ?? 150)
  }

  private onIdle = (): void => {
    if (this.touching || this.pressing) {
      this.markActive()
      return
    }
    this.active = false
    this.flushDeferred()
  }

  private onScroll = (): void => {
    const pos = this.getPos()
    if (this.virtual) {
      this.trail.push([performance.now(), pos])
      if (this.trail.length > 64)
        this.trail.shift()
    }
    if (this.expect === null || Math.abs(pos - this.expect) >= 1)
      this.markActive()
    this.expect = null
    this.sync()
  }

  private onWheel = (): void => {
    this.pin = null
    this.markActive()
  }

  private onTouchStart = (): void => {
    this.pin = null
    this.touching = true
    this.markActive()
  }

  private onTouchEnd = (): void => {
    this.touching = false
    this.markActive()
  }

  private onPointerDown = (ev: PointerEvent): void => {
    this.pin = null
    if (ev.pointerType === 'mouse')
      this.pressing = true
  }

  private onKey = (): void => {
    this.pin = null
  }

  private onPointerUp = (): void => {
    if (!this.pressing)
      return
    this.pressing = false
    if (!this.active)
      this.flushDeferred()
  }

  private onItemsResize = (records: ResizeObserverEntry[]): void => {
    if (this.destroyed)
      return
    this.inObserver = true
    try {
      this.handleItemsResize(records)
    }
    finally {
      this.inObserver = false
    }
  }

  private handleItemsResize(records: ResizeObserverEntry[]): void {
    const changes: Array<[Entry<T>, number]> = []
    for (const r of records) {
      const e = this.hosts.get(r.target)
      if (!e || !e.attached || !e.node)
        continue
      const h = snap(r.borderBoxSize?.[0]?.blockSize ?? r.contentRect.height)
      if (h <= 0)
        continue
      if (Math.abs(h - e.height) < EPS) {
        this.pending.delete(e)
        continue
      }
      if (hasPendingMedia(e.node.host)) {
        this.waitMedia(e)
        continue
      }
      changes.push([e, h])
    }
    if (changes.length) {
      this.applyHeights(changes, false)
      this.sync()
    }
  }

  private waitMedia(e: Entry<T>): void {
    if (e.waiting || !e.node)
      return
    e.waiting = true
    void settleMedia([e.node.host], this.o.mediaTimeout ?? 1500).then(() => {
      e.waiting = false
      if (this.destroyed || !e.attached || !e.node)
        return
      const h = snap(e.node.host.getBoundingClientRect().height)
      if (h > 0 && Math.abs(h - e.height) >= EPS) {
        this.applyHeights([[e, h]], false)
        this.sync()
      }
    })
  }

  private onViewportResize = (): void => {
    if (this.destroyed)
      return
    const w = this.content.getBoundingClientRect().width
    const widthChanged = Math.abs(w - this.width) > 0.5
    if (!widthChanged && this.viewport.clientHeight === this.vh)
      return
    this.inObserver = true
    try {
      this.readMetrics()
      if (widthChanged)
        this.markStale()
      if (this.width && this.onSized) {
        this.onSized()
        this.onSized = null
      }
      this.sync()
    }
    finally {
      this.inObserver = false
    }
  }

  private onFonts = (): void => {
    this.markStale()
  }

  private readMetrics(): void {
    this.vh = this.viewport.clientHeight
    this.width = this.content.getBoundingClientRect().width
    this.measurer.style.width = `${this.width}px`
    const cs = getComputedStyle(this.content)
    this.padStart = Number.parseFloat(cs.paddingTop) || 0
    this.padEnd = Number.parseFloat(cs.paddingBottom) || 0
    this.refreshSpacers()
  }

  private markStale(): void {
    let any = false
    for (const e of this.layout.list) {
      if (!e.attached && !e.gap) {
        e.stale = true
        any = true
      }
    }
    if (any)
      this.scheduleRemeasure()
  }

  private scheduleRemeasure(): void {
    clearTimeout(this.staleTimer)
    this.staleTimer = window.setTimeout(() => void this.remeasure(), 250)
  }

  private pickStale(limit: number): Entry<T>[] {
    const list = this.layout.list
    const out: Entry<T>[] = []
    let a = this.rs - 1
    let b = this.re
    while (out.length < limit && (a >= 0 || b < list.length)) {
      if (a >= 0) {
        const e = list[a--]
        if (e.stale && !e.attached)
          out.push(e)
      }
      if (b < list.length && out.length < limit) {
        const e = list[b++]
        if (e.stale && !e.attached)
          out.push(e)
      }
    }
    return out
  }

  private async remeasure(): Promise<void> {
    if (this.remeasuring)
      return
    this.remeasuring = true
    const gen = this.gen
    try {
      while (!this.destroyed && gen === this.gen) {
        await idle()
        if (this.destroyed || gen !== this.gen)
          break
        const batch = this.pickStale(24)
        if (!batch.length)
          break
        const frag = document.createDocumentFragment()
        for (const e of batch) {
          const node = e.node ?? this.createNode(e)
          this.cache.add(e)
          frag.append(node.wrap)
        }
        this.measurer.append(frag)
        await this.flushCommit()
        await settleMedia(batch.map(e => e.node?.host).filter(Boolean) as Element[], 800)
        const changes: Array<[Entry<T>, number]> = []
        for (const e of batch) {
          if (!e.node)
            continue
          const h = snap(e.node.host.getBoundingClientRect().height)
          if (e.node.wrap.parentNode === this.measurer)
            e.node.wrap.remove()
          if (e.attached)
            continue
          e.stale = false
          if (h > 0 && Math.abs(h - e.height) >= EPS)
            changes.push([e, h])
        }
        if (changes.length) {
          this.applyHeights(changes, false)
          this.sync()
        }
        this.trimCache()
      }
    }
    finally {
      this.remeasuring = false
    }
  }
}
