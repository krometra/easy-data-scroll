export interface User {
  id: number
  name: string
  color: string
}

export interface Message {
  id: number
  user: User
  text: string
  time: number
  image?: { w: number, h: number, delay: number }
  code?: string
  reply?: { id: number, user: User, text: string }
  long: boolean
  first: boolean
  day: boolean
  reactions: Record<string, number>
}

export const ME: User = { id: 0, name: 'Я', color: '#3b82f6' }

const USERS: User[] = [
  { id: 1, name: 'Кот Бублик', color: '#f97316' },
  { id: 2, name: 'Сова Луна', color: '#a855f7' },
  { id: 3, name: 'Ёж Колючкин', color: '#10b981' },
  { id: 4, name: 'Лиса Алиса', color: '#ec4899' },
  { id: 5, name: 'Енот Полоскун', color: '#eab308' },
  ME,
]

const WORDS = 'скролл список сообщение высота элемент браузер кадр колесо момент позиция прыгает рендер виртуальный чат история страница загрузка картинка ширина экран быстро красиво работает норм кажется надо проверить давай сделаем готово релиз ветка тест баг фича дизайн макет кнопка ответ вопрос вечером завтра сегодня потом точно наверное вообще просто кстати слушай смотри короче'.split(' ')

const CODE = [
  'const list = new InfinityScroll(el, {\n  origin: \'bottom\',\n  getKey: m => m.id,\n  render: m => renderMessage(m),\n  loadBefore: m => api.history(m?.id),\n})',
  'viewport.scrollTop = -distanceFromBottom',
  'ro.observe(host)\nif (zone === \'near\') pos += delta',
]

export const TOTAL = 100_000
const START = Date.UTC(2026, 0, 1, 6, 0, 0)

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sentence(r: () => number, words: number): string {
  const out: string[] = []
  for (let i = 0; i < words; i++)
    out.push(WORDS[Math.floor(r() * WORDS.length)])
  const s = out.join(' ')
  return s[0].toUpperCase() + s.slice(1)
}

function authorOf(id: number): User {
  const r = rng(id * 7 + 1)
  const prev = id > 1 ? rng((id - 1) * 7 + 1)() : -1
  const keep = r() < 0.45 && prev >= 0
  const v = keep ? prev : r()
  return USERS[Math.floor(v * USERS.length)]
}

function timeOf(id: number): number {
  return START + id * 47_000
}

function dayOf(t: number): number {
  return Math.floor((t + 3 * 3600_000) / 86_400_000)
}

function textOf(id: number): string {
  const r = rng(id * 13 + 5)
  const kind = r()
  if (kind < 0.35)
    return sentence(r, 1 + Math.floor(r() * 4))
  if (kind < 0.8)
    return sentence(r, 5 + Math.floor(r() * 18))
  const parts: string[] = []
  const n = 2 + Math.floor(r() * 5)
  for (let i = 0; i < n; i++)
    parts.push(`${sentence(r, 8 + Math.floor(r() * 20))}.`)
  return parts.join(' ')
}

export function messageById(id: number, users = USERS): Message {
  const r = rng(id * 31 + 17)
  const user = authorOf(id)
  const time = timeOf(id)
  const text = textOf(id)
  const m: Message = {
    id,
    user: users.find(u => u.id === user.id) ?? user,
    text,
    time,
    long: text.length > 420,
    first: id === 1 || authorOf(id - 1).id !== user.id,
    day: id === 1 || dayOf(timeOf(id - 1)) !== dayOf(time),
    reactions: {},
  }
  if (r() < 0.12) {
    const w = 480 + Math.floor(r() * 320)
    const ratio = [0.56, 0.75, 1, 1.33, 1.6][Math.floor(r() * 5)]
    m.image = { w, h: Math.round(w * ratio), delay: 100 + Math.floor(r() * 900) }
  }
  if (r() < 0.04)
    m.code = CODE[Math.floor(r() * CODE.length)]
  if (r() < 0.1 && id > 5) {
    const rid = id - 1 - Math.floor(r() * 40)
    if (rid >= 1) {
      const target = authorOf(rid)
      m.reply = { id: rid, user: target, text: textOf(rid).slice(0, 80) }
    }
  }
  if (r() < 0.15) {
    const set = ['👍', '🔥', '😂', '👀', '❤️']
    m.reactions[set[Math.floor(r() * set.length)]] = 1 + Math.floor(r() * 5)
  }
  return m
}

export interface BackendOptions {
  latency: () => number
  failRate?: () => number
}

export class Backend {
  private extra: Message[] = []
  private lastId = TOTAL
  private seq = 0
  calls = 0

  constructor(private opts: BackendOptions) {}

  get latestId(): number {
    return this.lastId
  }

  private get(id: number): Message | undefined {
    if (id < 1 || id > this.lastId)
      return undefined
    return id <= TOTAL ? messageById(id) : this.extra[id - TOTAL - 1]
  }

  private range(from: number, to: number): Message[] {
    const out: Message[] = []
    for (let id = Math.max(1, from); id <= Math.min(this.lastId, to); id++)
      out.push(this.get(id)!)
    return out
  }

  private async wait(): Promise<void> {
    await new Promise(r => setTimeout(r, this.opts.latency()))
    if (Math.random() < (this.opts.failRate?.() ?? 0))
      throw new Error('network')
  }

  async before(id: number | undefined, limit = 40): Promise<{ items: Message[], done: boolean }> {
    await this.wait()
    const end = id === undefined ? this.lastId : id - 1
    const items = this.range(end - limit + 1, end)
    return { items, done: items.length === 0 || items[0].id === 1 }
  }

  async after(id: number, limit = 40): Promise<{ items: Message[], done: boolean }> {
    await this.wait()
    const items = this.range(id + 1, id + limit)
    return { items, done: !items.length || items[items.length - 1].id >= this.lastId }
  }

  async rows(from: number, to: number): Promise<{ items: Message[], total: number }> {
    this.calls++
    await this.wait()
    return { items: this.range(from + 1, to), total: this.lastId }
  }

  async around(id: number, limit = 40): Promise<Message[]> {
    await this.wait()
    return this.range(id - Math.floor(limit / 2), id + Math.ceil(limit / 2))
  }

  post(user: User, text: string): Message {
    const prev = this.get(this.lastId)
    const id = ++this.lastId
    const time = Date.now() + this.seq++
    const m: Message = {
      id,
      user,
      text,
      time,
      long: text.length > 420,
      first: !prev || prev.user.id !== user.id,
      day: !prev || dayOf(prev.time) !== dayOf(time),
      reactions: {},
    }
    this.extra.push(m)
    return m
  }

  incoming(): Message {
    const r = Math.random
    const user = USERS[Math.floor(r() * (USERS.length - 1))]
    const m = this.post(user, textOf(Math.floor(r() * 1e6)))
    if (r() < 0.2) {
      const w = 480 + Math.floor(r() * 320)
      m.image = { w, h: Math.round(w * (0.6 + r() * 0.8)), delay: 200 + Math.floor(r() * 700) }
    }
    return m
  }
}
