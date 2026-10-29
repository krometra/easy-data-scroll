<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, useTemplateRef } from 'vue'
import { InfinityScroll, type InfinityScrollExpose } from '@krometra/easy-data-scroll/vue'
import { Backend, ME, TOTAL, type Message as Msg } from '../shared/backend'
import { startProbe, type Probe } from '../shared/hud'
import Message from '../vue/Message.vue'
import '../shared/messages.css'

type Demo = 'chat' | 'virtual' | 'feed'

const demo = ref<Demo>('virtual')
const latency = ref(600)
const live = ref(true)
const jumpTo = ref('31337')

const demos = [
  { value: 'virtual', label: 'Чат · виртуальный' },
  { value: 'chat', label: 'Чат · бесконечный' },
  { value: 'feed', label: 'Лента' },
]
const latencies = [
  { value: 0, label: '0' },
  { value: 600, label: '0,6 с' },
  { value: 1500, label: '1,5 с' },
  { value: 3000, label: '3 с' },
]

const backend = new Backend({ latency: () => latency.value * (0.6 + Math.random() * 0.8) })
const scroll = useTemplateRef<InfinityScrollExpose<Msg>>('scroll')
const probe = shallowRef<Probe | null>(null)
const stats = reactive({ loaded: 0, total: 0, rendered: 0, busy: 0, jumps: 0, stuck: true })

const virtual = computed(() => demo.value === 'virtual')
const origin = computed(() => (demo.value === 'feed' ? 'top' : 'bottom'))

function loadBefore(m?: Msg) {
  return backend.before(m?.id)
}

function loadAfter(m?: Msg) {
  return backend.after(m!.id)
}

async function loadFeed(m?: Msg) {
  const page = await backend.before(m?.id)
  return { items: page.items.reverse(), done: page.done }
}

function loadRange(from: number, to: number) {
  return backend.rows(from, to)
}

function feedItem(m: Msg): Msg {
  return { ...m, first: true, day: false }
}

async function jump() {
  const id = Number(jumpTo.value)
  const list = scroll.value
  if (!list || !Number.isFinite(id) || id < 1)
    return
  if (virtual.value) {
    list.scrollToIndex(id - 1, { align: 'center' })
    return
  }
  if (list.list?.has(id)) {
    list.scrollToKey(id, { align: 'center', behavior: 'smooth' })
    return
  }
  const items = await backend.around(id)
  if (demo.value === 'feed')
    items.reverse()
  await list.reset(items, {
    anchor: id,
    hasBefore: demo.value === 'feed' ? items[0].id < backend.latestId : items[0].id > 1,
    hasAfter: demo.value === 'feed' ? items[items.length - 1].id > 1 : items[items.length - 1].id < backend.latestId,
  })
}

function toEdge() {
  if (origin.value === 'bottom')
    scroll.value?.scrollToBottom({ behavior: 'smooth' })
  else
    scroll.value?.scrollToTop({ behavior: 'smooth' })
}

function onClick(ev: MouseEvent) {
  const reply = (ev.target as HTMLElement).closest<HTMLElement>('[data-reply]')
  if (!reply)
    return
  ev.preventDefault()
  jumpTo.value = reply.dataset.reply!
  void jump()
}

let incoming = 0
function scheduleIncoming() {
  incoming = window.setTimeout(() => {
    const list = scroll.value
    if (live.value && list && demo.value !== 'feed')
      void list.append([backend.incoming()])
    scheduleIncoming()
  }, 2500 + Math.random() * 4000)
}

let timer = 0
let probed: unknown = null
onMounted(() => {
  scheduleIncoming()
  timer = window.setInterval(() => {
    const list = scroll.value?.list
    if (!list)
      return
    if (list !== probed) {
      probed = list
      probe.value = startProbe(list as never)
    }
    const s = list.stats
    stats.loaded = s.loaded
    stats.total = s.total
    stats.rendered = s.rendered
    stats.busy = s.busyWrites
    stats.jumps = probe.value?.jumps ?? 0
    stats.stuck = list.isStuck
  }, 300)
})

onBeforeUnmount(() => {
  clearTimeout(incoming)
  clearInterval(timer)
})

function send() {
  void scroll.value?.append([backend.post(ME, 'Новое сообщение из витрины')]).then(toEdge)
}

const fmt = (n: number) => n.toLocaleString('ru-RU')
</script>

<template>
  <KCard title="Живой пример" subtitle="100 000 сообщений разной высоты, картинки без заданных размеров, сеть с задержкой">
    <template #actions>
      <KSegmented v-model="demo" :options="demos" size="sm" />
    </template>

    <div class="live__controls">
      <div class="live__control">
        <span class="live__label">Сеть</span>
        <KSegmented v-model="latency" :options="latencies" size="sm" />
      </div>
      <KSwitch v-model="live" label="Входящие сообщения" :disabled="demo === 'feed'" />
      <div class="live__jump">
        <KInput v-model="jumpTo" size="sm" inline label="К сообщению №" type="number" />
        <KButton size="sm" variant="secondary" icon="search" @click="jump">Перейти</KButton>
      </div>
      <div class="live__grow" />
      <KButton size="sm" variant="ghost" :icon="origin === 'bottom' ? 'chevron-down' : 'chevron-up'" @click="toEdge">
        {{ origin === 'bottom' ? 'Вниз' : 'Вверх' }}
      </KButton>
      <KButton v-if="demo !== 'feed'" size="sm" variant="primary" icon="add" @click="send">Отправить</KButton>
    </div>

    <div class="live__frame" @click="onClick">
      <InfinityScroll
        v-if="demo === 'virtual'"
        key="virtual"
        ref="scroll"
        class="list"
        mode="virtual"
        origin="bottom"
        :total="TOTAL"
        :page-size="40"
        :estimated-height="80"
        :get-key="m => m.id"
        :load-range="loadRange"
      >
        <template #default="{ item }">
          <Message :m="item" />
        </template>
      </InfinityScroll>
      <InfinityScroll
        v-else-if="demo === 'chat'"
        key="chat"
        ref="scroll"
        class="list"
        origin="bottom"
        :get-key="m => m.id"
        :load-before="loadBefore"
        :load-after="loadAfter"
      >
        <template #default="{ item }">
          <Message :m="item" />
        </template>
      </InfinityScroll>
      <InfinityScroll
        v-else
        key="feed"
        ref="scroll"
        class="list live__feed"
        origin="top"
        :get-key="m => m.id"
        :load-after="loadFeed"
      >
        <template #default="{ item }">
          <Message :m="feedItem(item)" />
        </template>
      </InfinityScroll>
    </div>

    <div class="live__stats">
      <KStat label="Загружено" :value="virtual ? `${fmt(stats.loaded)} из ${fmt(stats.total)}` : fmt(stats.loaded)" icon="download" />
      <KStat label="В DOM сейчас" :value="stats.rendered" hint="элементов на экране и рядом" icon="list" />
      <KStat label="Поправок во время прокрутки" :value="stats.busy" :tone="stats.busy ? 'danger' : 'success'" icon="move" />
      <KStat label="Сдвигов содержимого" :value="stats.jumps" :tone="stats.jumps ? 'danger' : 'success'" icon="check" />
    </div>
  </KCard>
</template>

<style scoped>
.live__controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  margin-bottom: 1rem;
}
.live__control,
.live__jump {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.live__label {
  font-size: 0.8125rem;
  color: var(--k-text-muted);
}
.live__grow { flex: 1; }
.live__jump :deep(.k-input__box) { width: 6.5rem; }
.live__frame {
  --bg: var(--k-bg);
  --panel: var(--k-surface);
  --panel-2: var(--k-surface-muted);
  --text: var(--k-text);
  --muted: var(--k-text-muted);
  --line: var(--k-border);
  --skeleton: var(--k-border);
  --bubble: var(--k-surface);
  --bubble-mine: var(--k-primary-soft);
  --accent: var(--k-primary);
  --shadow: var(--k-shadow-sm);
  --flash: var(--k-selection);
  --code-bg: #0f172a;
  --code-text: #e2e8f0;
  height: 34rem;
  display: flex;
  flex-direction: column;
  background: var(--k-bg);
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius);
  overflow: hidden;
}
.live__frame :deep(.eds-vue) {
  flex: 1;
  min-height: 0;
}
.live__frame :deep(.msg) {
  font-size: 0.875rem;
}
.live__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}
</style>
