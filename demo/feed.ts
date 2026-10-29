import './shared/chat.css'
import { InfinityScroll } from '@krometra/easy-data-scroll'
import { Backend, type Message } from './shared/backend'
import { renderMessage } from './shared/message'

const params = new URLSearchParams(location.search)
const latency = Number(params.get('latency') ?? 600)
const live = params.get('live') !== '0'
const backend = new Backend({ latency: () => latency * (0.6 + Math.random() * 0.8) })
const fresh = document.querySelector<HTMLButtonElement>('#fresh')!
let waiting = 0

function render(m: Message) {
  const el = renderMessage({ ...m, first: true, day: false })
  el.classList.add('post')
  return el
}

const list = new InfinityScroll<Message>(document.querySelector<HTMLElement>('#list')!, {
  origin: 'top',
  getKey: m => m.id,
  render,
  loadAfter: async (m) => {
    const page = await backend.before(m?.id)
    return { items: page.items.reverse(), done: page.done }
  },
  onStickChange(stuck) {
    if (stuck) {
      waiting = 0
      fresh.classList.remove('show')
    }
  },
})

fresh.addEventListener('click', () => list.scrollToTop({ behavior: 'smooth' }))

function tick() {
  setTimeout(() => {
    if (live) {
      const m = backend.incoming()
      void list.prepend([m]).then(() => {
        if (!list.isStuck) {
          waiting++
          fresh.textContent = `Новых постов: ${waiting} ↑`
          fresh.classList.add('show')
        }
      })
    }
    tick()
  }, 3000 + Math.random() * 4000)
}
tick()

Object.assign(window, { list, backend })
