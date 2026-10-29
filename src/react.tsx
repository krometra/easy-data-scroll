import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useReducer,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import {
  InfinityScroll as Core,
  type InfinityScrollOptions,
  type Key,
  type LoadSide,
  type LoadState,
  type ResetOptions,
  type ScrollOptions,
  type VisibleRange,
} from './core.js'

type CoreOptions<T> = Omit<InfinityScrollOptions<T>, 'render' | 'update' | 'unmount' | 'commit' | 'renderLoader'>

export interface InfinityScrollProps<T> extends CoreOptions<T> {
  renderItem: (item: T) => ReactNode
  className?: string
  style?: CSSProperties
  onStickChange?: (stuck: boolean) => void
  onVisibleChange?: (range: VisibleRange<T> | null) => void
  onLoadStateChange?: (side: LoadSide, state: LoadState, error?: unknown) => void
  onTotalChange?: (total: number) => void
  query?: unknown
}

export interface InfinityScrollHandle<T> {
  readonly list: Core<T> | null
  append: (items: T[]) => Promise<void>
  prepend: (items: T[]) => Promise<void>
  update: (key: Key, item?: T) => boolean
  remove: (key: Key) => boolean
  reset: (items?: T[], options?: ResetOptions) => Promise<void>
  scrollToKey: (key: Key, options?: ScrollOptions) => boolean
  scrollToIndex: (index: number, options?: ScrollOptions) => boolean
  indexOfKey: (key: Key) => number
  scrollToTop: (options?: ScrollOptions) => void
  scrollToBottom: (options?: ScrollOptions) => void
}

interface Live<T> {
  id: number
  item: T
  v: number
}

interface PortalProps {
  host: HTMLElement
  item: unknown
  v: number
  render: (item: any) => ReactNode
}

function queryKey(q: unknown): unknown {
  return q !== null && typeof q === 'object' ? JSON.stringify(q) : q
}

const Portal = memo(({ host, item, render }: PortalProps) => createPortal(render(item), host))

function InfinityScrollInner<T>(props: InfinityScrollProps<T>, ref: Ref<InfinityScrollHandle<T>>) {
  const el = useRef<HTMLDivElement>(null)
  const live = useRef(new Map<HTMLElement, Live<T>>())
  const list = useRef<Core<T> | null>(null)
  const latest = useRef(props)
  latest.current = props
  const [, bump] = useReducer((x: number) => x + 1, 0)

  useLayoutEffect(() => {
    const p = latest.current
    let alive = true
    let seq = 0
    const map = live.current
    const core = new Core<T>(el.current!, {
      getKey: item => latest.current.getKey(item),
      origin: p.origin,
      mode: p.mode,
      loadRange: p.loadRange && ((from, to) => latest.current.loadRange!(from, to)),
      total: p.total,
      pageSize: p.pageSize,
      estimatedHeight: p.estimatedHeight,
      maxItems: p.maxItems,
      loadBefore: p.loadBefore && ((edge, side) => latest.current.loadBefore!(edge, side)),
      loadAfter: p.loadAfter && ((edge, side) => latest.current.loadAfter!(edge, side)),
      items: p.items,
      hasBefore: p.hasBefore,
      hasAfter: p.hasAfter,
      anchor: p.anchor,
      overscan: p.overscan,
      threshold: p.threshold,
      cacheSize: p.cacheSize,
      mediaTimeout: p.mediaTimeout,
      idleDelay: p.idleDelay,
      animate: p.animate,
      render: (item, host) => {
        map.set(host, { id: ++seq, item, v: 0 })
      },
      update: (item, host) => {
        const r = map.get(host)
        map.set(host, { id: r?.id ?? ++seq, item, v: (r?.v ?? 0) + 1 })
      },
      unmount: (_item, host) => {
        map.delete(host)
      },
      commit: () => new Promise<void>((resolve) => {
        queueMicrotask(() => {
          if (alive)
            flushSync(() => bump())
          resolve()
        })
      }),
      onStickChange: stuck => latest.current.onStickChange?.(stuck),
      onVisibleChange: range => latest.current.onVisibleChange?.(range),
      onLoadStateChange: (side, state, error) => latest.current.onLoadStateChange?.(side, state, error),
      onTotalChange: total => latest.current.onTotalChange?.(total),
    })
    list.current = core
    return () => {
      alive = false
      core.destroy()
      list.current = null
      map.clear()
    }
  }, [])

  const query = queryKey(props.query)
  const lastQuery = useRef(query)
  useEffect(() => {
    if (Object.is(lastQuery.current, query))
      return
    lastQuery.current = query
    void list.current?.reset(undefined, { total: null })
  }, [query])

  useEffect(() => {
    const core = list.current
    if (core && props.total !== undefined && props.total !== core.total)
      core.setTotal(props.total)
  }, [props.total])

  useImperativeHandle(ref, () => ({
    get list() {
      return list.current
    },
    append: items => list.current?.append(items) ?? Promise.resolve(),
    prepend: items => list.current?.prepend(items) ?? Promise.resolve(),
    update: (key, item) => list.current?.update(key, item) ?? false,
    remove: key => list.current?.remove(key) ?? false,
    reset: (items, options) => list.current?.reset(items, options) ?? Promise.resolve(),
    scrollToKey: (key, options) => list.current?.scrollToKey(key, options) ?? false,
    scrollToIndex: (index, options) => list.current?.scrollToIndex(index, options) ?? false,
    indexOfKey: key => list.current?.indexOfKey(key) ?? -1,
    scrollToTop: options => list.current?.scrollToTop(options),
    scrollToBottom: options => list.current?.scrollToBottom(options),
  }), [])

  const portals: ReactElement[] = []
  for (const [host, r] of live.current)
    portals.push(<Portal key={r.id} host={host} item={r.item} v={r.v} render={props.renderItem} />)

  return (
    <div className={props.className} style={props.style}>
      <div ref={el} style={{ height: '100%' }} />
      {portals}
    </div>
  )
}

export const InfinityScroll = forwardRef(InfinityScrollInner) as <T>(
  props: InfinityScrollProps<T> & { ref?: Ref<InfinityScrollHandle<T>> },
) => ReactElement

export default InfinityScroll
