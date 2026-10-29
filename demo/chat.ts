import './shared/chat.css'
import { InfinityScroll } from '@krometra/easy-data-scroll'
import { Backend, ME, type Message } from './shared/backend'
import { mountHud } from './shared/hud'
import { renderMessage } from './shared/message'

const params = new URLSearchParams(location.search)
const settings = {
  latency: Number(params.get('latency') ?? 600),
  live: params.get('live') !== '0',
  fail: Number(params.get('fail') ?? 0),
}

const backend = new Backend({
  latency: () => settings.latency * (0.6 + Math.random() * 0.8),
  failRate: () => settings.fail,
})

const listEl = document.querySelector<HTMLElement>('#list')!
const down = document.querySelector<HTMLButtonElement>('#down')!
const badge = document.querySelector<HTMLElement>('#badge')!
const status = document.querySelector<HTMLElement>('#status')!
let unread = 0

const list = new InfinityScroll<Message>(listEl, {
  origin: 'bottom',
  getKey: m => m.id,
  render: renderMessage,
  loadBefore: m => backend.before(m?.id),
  loadAfter: m => backend.after(m!.id),
  onStickChange(stuck) {
    down.classList.toggle('show', !stuck)
    if (stuck) {
      unread = 0
      badge.textContent = ''
    }
  },
  onLoadStateChange(side, state) {
    if (state === 'error')
      status.textContent = `Сеть моргнула (${side === 'before' ? 'история' : 'новые'}), повторю`
    else if (state === 'done' && side === 'before')
      status.textContent = 'Это самое начало переписки'
    else if (state === 'loading')
      status.textContent = side === 'before' ? 'Подгружаю историю…' : 'Подгружаю новые…'
    else
      status.textContent = '100 000 сообщений в истории'
  },
})

Object.assign(window, { list, backend })

function flash(id: number) {
  setTimeout(() => {
    const el = listEl.querySelector(`.msg[data-id="${id}"]`)
    el?.classList.remove('flash')
    void (el as HTMLElement | null)?.offsetWidth
    el?.classList.add('flash')
  }, 450)
}

async function jumpTo(id: number) {
  if (list.has(id)) {
    list.scrollToKey(id, { behavior: 'smooth' })
    flash(id)
    return
  }
  const items = await backend.around(id)
  if (!items.length)
    return
  await list.reset(items, {
    anchor: id,
    hasBefore: items[0].id > 1,
    hasAfter: items[items.length - 1].id < backend.latestId,
  })
  flash(id)
}

listEl.addEventListener('click', (ev) => {
  const t = ev.target as HTMLElement
  const msgEl = t.closest<HTMLElement>('.msg')
  const id = Number(msgEl?.dataset.id)
  const reply = t.closest<HTMLElement>('[data-reply]')
  if (reply) {
    ev.preventDefault()
    void jumpTo(Number(reply.dataset.reply))
    return
  }
  if (t.closest('.more') && msgEl) {
    const m = list.get(id)
    if (m)
      m.long = false
    msgEl.querySelector('.text')?.classList.remove('collapsed')
    t.closest('.more')?.remove()
  }
})

listEl.addEventListener('dblclick', (ev) => {
  const msgEl = (ev.target as HTMLElement).closest<HTMLElement>('.msg')
  const m = msgEl && list.get(Number(msgEl.dataset.id))
  if (!m)
    return
  m.reactions = { ...m.reactions, '❤️': (m.reactions['❤️'] ?? 0) + 1 }
  list.update(m.id, m)
})

down.addEventListener('click', () => list.scrollToBottom({ behavior: 'smooth' }))

const form = document.querySelector<HTMLFormElement>('#composer')!
const input = document.querySelector<HTMLTextAreaElement>('#input')!
form.addEventListener('submit', async (ev) => {
  ev.preventDefault()
  const text = input.value.trim()
  if (!text)
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

function scheduleIncoming() {
  setTimeout(() => {
    if (settings.live) {
      const m = backend.incoming()
      void list.append([m]).then(() => {
        if (!list.isStuck && list.has(m.id)) {
          unread++
          badge.textContent = String(unread)
        }
      })
    }
    scheduleIncoming()
  }, 2500 + Math.random() * 4000)
}
scheduleIncoming()

const probe = mountHud(document.querySelector('#hud')!, list as InfinityScroll<unknown>, [
  {
    label: 'latency',
    html: `<label>Задержка сети <input type="range" min="0" max="3000" step="100" value="${settings.latency}"> <output>${settings.latency} мс</output></label>`,
    bind(el) {
      const r = el.querySelector('input')!
      const out = el.querySelector('output')!
      r.addEventListener('input', () => {
        settings.latency = Number(r.value)
        out.textContent = `${r.value} мс`
      })
    },
  },
  {
    label: 'live',
    html: `<label>Входящие сообщения <input type="checkbox" ${settings.live ? 'checked' : ''}></label>`,
    bind(el) {
      const c = el.querySelector('input')!
      c.addEventListener('change', () => { settings.live = c.checked })
    },
  },
  {
    label: 'fail',
    html: `<label>Сбои сети (20%) <input type="checkbox" ${settings.fail ? 'checked' : ''}></label>`,
    bind(el) {
      const c = el.querySelector('input')!
      c.addEventListener('change', () => { settings.fail = c.checked ? 0.2 : 0 })
    },
  },
  {
    label: 'narrow',
    html: '<label>Узкий чат (смена ширины) <input type="checkbox"></label>',
    bind(el) {
      const c = el.querySelector('input')!
      c.addEventListener('change', () => {
        document.querySelector<HTMLElement>('.chat')!.style.setProperty('--chat-width', c.checked ? '480px' : '100%')
      })
    },
  },
  {
    label: 'jump',
    html: '<label>Прыгнуть к № <input type="number" min="1" max="100000" value="31337"></label>',
    bind(el) {
      const n = el.querySelector('input')!
      n.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter')
          void jumpTo(Number(n.value))
      })
    },
  },
  {
    label: 'buttons',
    html: '<div class="btns"><button data-a="jump">Прыгнуть</button><button data-a="random">Случайное</button><button data-a="top">Вверх</button><button data-a="bottom">Вниз</button><button data-a="theme">Тема</button></div>',
    bind(el) {
      el.addEventListener('click', (ev) => {
        const a = (ev.target as HTMLElement).dataset.a
        if (a === 'jump')
          void jumpTo(Number(document.querySelector<HTMLInputElement>('#hud input[type=number]')!.value))
        if (a === 'random')
          void jumpTo(1 + Math.floor(Math.random() * 99_000))
        if (a === 'top')
          list.scrollToTop({ behavior: 'smooth' })
        if (a === 'bottom')
          list.scrollToBottom({ behavior: 'smooth' })
        if (a === 'theme') {
          const r = document.documentElement
          const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
          r.dataset.theme = dark ? 'light' : 'dark'
        }
      })
    },
  },
])

Object.assign(window, { probe })
