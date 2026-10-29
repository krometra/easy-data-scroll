import {
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowReactive,
  shallowRef,
  Teleport,
  watch,
  type AllowedComponentProps,
  type ComponentCustomProps,
  type PropType,
  type SlotsType,
  type VNode,
  type VNodeChild,
  type VNodeProps,
} from 'vue'
import {
  InfinityScroll as Core,
  type Key,
  type Loader,
  type LoadSide,
  type LoadState,
  type Mode,
  type Origin,
  type RangeLoader,
  type ResetOptions,
  type ScrollOptions,
  type VisibleRange,
} from './core.js'

export interface InfinityScrollExpose<T> {
  readonly list: Core<T> | undefined
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

export interface InfinityScrollProps<T> {
  getKey: (item: T) => Key
  origin?: Origin
  mode?: Mode
  loadRange?: RangeLoader<T>
  total?: number
  query?: unknown
  pageSize?: number
  estimatedHeight?: number
  maxItems?: number
  loadBefore?: Loader<T>
  loadAfter?: Loader<T>
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
  onStick?: (stuck: boolean) => void
  onVisible?: (range: VisibleRange<T> | null) => void
  onLoadState?: (side: LoadSide, state: LoadState, error?: unknown) => void
  'onUpdate:total'?: (total: number) => void
}

export interface InfinityScrollSlots<T> {
  default?: (scope: { item: T }) => VNodeChild
}

export interface InfinityScrollEmit<T> {
  (event: 'stick', stuck: boolean): void
  (event: 'visible', range: VisibleRange<T> | null): void
  (event: 'loadState', side: LoadSide, state: LoadState, error?: unknown): void
  (event: 'update:total', total: number): void
}

interface InfinityScrollContext<T> {
  props: InfinityScrollProps<T>
  expose: (exposed: InfinityScrollExpose<T>) => void
  attrs: Record<string, unknown>
  slots: InfinityScrollSlots<T>
  emit: InfinityScrollEmit<T>
}

export type InfinityScrollComponent = <T>(
  props: InfinityScrollProps<T> & VNodeProps & AllowedComponentProps & ComponentCustomProps,
  ctx?: Pick<InfinityScrollContext<T>, 'attrs' | 'slots' | 'emit'>,
  expose?: (exposed: InfinityScrollExpose<T>) => void,
  setup?: Promise<InfinityScrollContext<T>>,
) => VNode & { __ctx?: InfinityScrollContext<T> }

interface Live {
  id: number
  item: unknown
  v: number
}

type ItemSlot = (props: { item: any }) => VNode[]

const Portal = defineComponent({
  name: 'InfinityScrollPortal',
  props: {
    to: { type: Object as PropType<HTMLElement>, required: true },
    item: { type: null as unknown as PropType<unknown>, required: true },
    v: { type: Number, required: true },
    slot: { type: Function as PropType<ItemSlot>, required: true },
  },
  setup(p) {
    return () => h(Teleport, { to: p.to }, p.slot({ item: p.item }))
  },
})

function queryKey(q: unknown): unknown {
  return q !== null && typeof q === 'object' ? JSON.stringify(q) : q
}

const Component = defineComponent({
  name: 'InfinityScroll',
  props: {
    getKey: { type: Function as PropType<(item: any) => Key>, required: true },
    origin: { type: String as PropType<Origin>, default: undefined },
    mode: { type: String as PropType<Mode>, default: undefined },
    loadRange: { type: Function as PropType<RangeLoader<any>>, default: undefined },
    total: { type: Number, default: undefined },
    query: { type: null as unknown as PropType<unknown>, default: undefined },
    pageSize: { type: Number, default: undefined },
    estimatedHeight: { type: Number, default: undefined },
    maxItems: { type: Number, default: undefined },
    loadBefore: { type: Function as PropType<Loader<any>>, default: undefined },
    loadAfter: { type: Function as PropType<Loader<any>>, default: undefined },
    items: { type: Array as PropType<any[]>, default: undefined },
    hasBefore: { type: Boolean, default: undefined },
    hasAfter: { type: Boolean, default: undefined },
    anchor: { type: [String, Number] as PropType<Key>, default: undefined },
    overscan: { type: Number, default: undefined },
    threshold: { type: Number, default: undefined },
    cacheSize: { type: Number, default: undefined },
    mediaTimeout: { type: Number, default: undefined },
    idleDelay: { type: Number, default: undefined },
    animate: { type: [Boolean, Object] as PropType<boolean | { duration?: number, easing?: string }>, default: undefined },
  },
  emits: {
    stick: (_stuck: boolean) => true,
    visible: (_range: VisibleRange<any> | null) => true,
    loadState: (_side: LoadSide, _state: LoadState, _error?: unknown) => true,
    'update:total': (_total: number) => true,
  },
  slots: Object as SlotsType<{ default: { item: any } }>,
  setup(props, { slots, emit, expose }) {
    const el = shallowRef<HTMLElement>()
    const live = shallowReactive(new Map<HTMLElement, Live>())
    let list: Core<unknown> | undefined
    let seq = 0

    onMounted(() => {
      const p = props
      list = new Core<unknown>(el.value!, {
        getKey: item => p.getKey(item),
        origin: p.origin,
        mode: p.mode,
        loadRange: p.loadRange && ((from, to) => p.loadRange!(from, to)),
        total: p.total,
        pageSize: p.pageSize,
        estimatedHeight: p.estimatedHeight,
        maxItems: p.maxItems,
        loadBefore: p.loadBefore && ((edge, side) => p.loadBefore!(edge, side)),
        loadAfter: p.loadAfter && ((edge, side) => p.loadAfter!(edge, side)),
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
          live.set(host, { id: ++seq, item, v: 0 })
        },
        update: (item, host) => {
          const r = live.get(host)
          live.set(host, { id: r?.id ?? ++seq, item, v: (r?.v ?? 0) + 1 })
        },
        unmount: (_item, host) => {
          live.delete(host)
        },
        commit: () => nextTick(),
        onStickChange: stuck => emit('stick', stuck),
        onVisibleChange: range => emit('visible', range),
        onLoadStateChange: (side, state, error) => emit('loadState', side, state, error),
        onTotalChange: (total) => {
          if (total !== props.total)
            emit('update:total', total)
        },
      })
    })

    watch(() => queryKey(props.query), () => {
      if (list)
        void list.reset(undefined, { total: null })
    })

    watch(() => props.total, (total) => {
      if (list && total !== undefined && total !== list.total)
        list.setTotal(total)
    })

    onBeforeUnmount(() => {
      list?.destroy()
      list = undefined
    })

    const api: InfinityScrollExpose<unknown> = {
      get list() {
        return list
      },
      append: items => list?.append(items) ?? Promise.resolve(),
      prepend: items => list?.prepend(items) ?? Promise.resolve(),
      update: (key, item) => list?.update(key, item) ?? false,
      remove: key => list?.remove(key) ?? false,
      reset: (items, options) => list?.reset(items, options) ?? Promise.resolve(),
      scrollToKey: (key, options) => list?.scrollToKey(key, options) ?? false,
      scrollToIndex: (index, options) => list?.scrollToIndex(index, options) ?? false,
      indexOfKey: key => list?.indexOfKey(key) ?? -1,
      scrollToTop: options => list?.scrollToTop(options),
      scrollToBottom: options => list?.scrollToBottom(options),
    }
    expose(api)

    return () => {
      const slot = slots.default as unknown as ItemSlot | undefined
      const portals = slot
        ? Array.from(live, ([host, r]) => h(Portal, { key: r.id, to: host, item: r.item, v: r.v, slot }))
        : []
      return h('div', { class: 'eds-vue' }, [h('div', { ref: el, style: 'height:100%' }), ...portals])
    }
  },
})

export const InfinityScroll = Component as unknown as InfinityScrollComponent

export default InfinityScroll
