export interface Sized {
  height: number
  index: number
  count?: number
}

export class Layout<E extends Sized> {
  list: E[] = []
  private prefix = new Float64Array(64)
  private rowPrefix = new Float64Array(64)
  private dirtyFrom = 0

  get length(): number {
    return this.list.length
  }

  total(): number {
    this.build()
    return this.prefix[this.list.length]
  }

  rows(): number {
    this.build()
    return this.rowPrefix[this.list.length]
  }

  offset(i: number): number {
    this.build()
    const n = this.list.length
    return this.prefix[i < 0 ? 0 : i > n ? n : i]
  }

  rowOf(i: number): number {
    this.build()
    const n = this.list.length
    return this.rowPrefix[i < 0 ? 0 : i > n ? n : i]
  }

  indexOf(e: E): number {
    this.build()
    return this.list[e.index] === e ? e.index : -1
  }

  indexAt(y: number): number {
    this.build()
    return search(this.prefix, this.list.length, y)
  }

  indexAtRow(r: number): number {
    this.build()
    return search(this.rowPrefix, this.list.length, r)
  }

  insert(at: number, items: E[]): void {
    if (!items.length)
      return
    if (at >= this.list.length) {
      for (const e of items)
        this.list.push(e)
    }
    else {
      this.list = at <= 0 ? items.concat(this.list) : this.list.slice(0, at).concat(items, this.list.slice(at))
    }
    this.touch(at)
  }

  replace(at: number, count: number, items: E[]): void {
    this.list = this.list.slice(0, at).concat(items, this.list.slice(at + count))
    this.touch(at)
  }

  assign(list: E[]): void {
    this.list = list
    this.dirtyFrom = 0
  }

  remove(at: number, count = 1): E[] {
    const out = this.list.splice(at, count)
    this.touch(at)
    return out
  }

  clear(): void {
    this.list = []
    this.dirtyFrom = 0
  }

  setHeight(e: E, h: number): void {
    e.height = h
    this.touch(e.index)
  }

  touch(i: number): void {
    if (i < this.dirtyFrom)
      this.dirtyFrom = Math.max(0, i)
  }

  private build(): void {
    const n = this.list.length
    if (this.dirtyFrom >= n + 1)
      return
    if (this.prefix.length < n + 1) {
      const size = Math.max(n + 1, this.prefix.length * 2)
      const next = new Float64Array(size)
      next.set(this.prefix.subarray(0, this.dirtyFrom + 1))
      this.prefix = next
      const rows = new Float64Array(size)
      rows.set(this.rowPrefix.subarray(0, this.dirtyFrom + 1))
      this.rowPrefix = rows
    }
    const p = this.prefix
    const q = this.rowPrefix
    const list = this.list
    let i = this.dirtyFrom
    let s = i === 0 ? 0 : p[i]
    let r = i === 0 ? 0 : q[i]
    p[0] = 0
    q[0] = 0
    for (; i < n; i++) {
      const e = list[i]
      e.index = i
      s += e.height
      r += e.count ?? 1
      p[i + 1] = s
      q[i + 1] = r
    }
    this.dirtyFrom = n + 1
  }
}

function search(p: Float64Array, n: number, y: number): number {
  if (n === 0)
    return 0
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (p[mid] <= y)
      lo = mid
    else
      hi = mid - 1
  }
  return lo
}
