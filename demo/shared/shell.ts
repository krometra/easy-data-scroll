import type { InfinityScroll } from '@krometra/easy-data-scroll'
import { Backend, ME, type Message } from './backend'

export interface Shell {
  backend: Backend
  loadBefore: (m: Message | undefined) => Promise<{ items: Message[], done: boolean }>
  loadAfter: (m: Message | undefined) => Promise<{ items: Message[], done: boolean }>
  getKey: (m: Message) => number
  attach: (list: InfinityScroll<Message>) => void
  onStick: (stuck: boolean) => void
}

export function chatShell(): Shell {
  const params = new URLSearchParams(location.search)
  const latency = Number(params.get('latency') ?? 600)
  const live = params.get('live') !== '0'
  const backend = new Backend({ latency: () => latency * (0.6 + Math.random() * 0.8) })
  const down = document.querySelector<HTMLButtonElement>('#down')!
  const badge = document.querySelector<HTMLElement>('#badge')!
  const form = document.querySelector<HTMLFormElement>('#composer')!
  const input = document.querySelector<HTMLTextAreaElement>('#input')!
  let list: InfinityScroll<Message> | null = null
  let unread = 0

  async function jumpTo(id: number) {
    if (!list)
      return
    if (list.has(id)) {
      list.scrollToKey(id, { behavior: 'smooth' })
      return
    }
    const items = await backend.around(id)
    await list.reset(items, {
      anchor: id,
      hasBefore: items[0].id > 1,
      hasAfter: items[items.length - 1].id < backend.latestId,
    })
  }

  document.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement
    const reply = t.closest<HTMLElement>('.eds [data-reply]')
    if (reply) {
      ev.preventDefault()
      void jumpTo(Number(reply.dataset.reply))
      return
    }
    const more = t.closest('.eds .more')
    const id = Number(t.closest<HTMLElement>('.msg')?.dataset.id)
    const m = more && list?.get(id)
    if (m)
      list!.update(id, { ...m, long: false })
  })

  down.addEventListener('click', () => list?.scrollToBottom({ behavior: 'smooth' }))

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const text = input.value.trim()
    if (!text || !list)
      return
    input.value = ''
    const m = backend.post(ME, text)
    if (list.hasMore.after) {
      await list.reset()
      return
    }
    await list.append([m])
    list.scrollToBottom({ behavior: 'smooth' })
  })

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault()
      form.requestSubmit()
    }
  })

  const tick = () => {
    setTimeout(() => {
      if (live && list) {
        const m = backend.incoming()
        void list.append([m]).then(() => {
          if (list && !list.isStuck && list.has(m.id)) {
            unread++
            badge.textContent = String(unread)
          }
        })
      }
      tick()
    }, 2500 + Math.random() * 4000)
  }
  tick()

  return {
    backend,
    loadBefore: m => backend.before(m?.id),
    loadAfter: m => backend.after(m!.id),
    getKey: m => m.id,
    attach(l) {
      list = l
      Object.assign(window, { list: l, backend })
    },
    onStick(stuck) {
      down.classList.toggle('show', !stuck)
      if (stuck) {
        unread = 0
        badge.textContent = ''
      }
    },
  }
}
