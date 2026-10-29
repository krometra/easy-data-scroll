import type { Message } from './backend'
import { ME } from './backend'
import { pictureSvg } from './picture'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const timeFmt = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' })

export function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export function imageUrl(m: Message): string {
  const i = m.image!
  if (import.meta.env.DEV)
    return `/img?w=${i.w}&h=${i.h}&seed=${m.id}&delay=${i.delay}`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pictureSvg(i.w, i.h, m.id))}`
}

export function timeOf(m: Message): string {
  return timeFmt.format(m.time)
}

export function dayLabel(m: Message): string {
  return dayFmt.format(m.time)
}

function reactionsHtml(m: Message): string {
  const list = Object.entries(m.reactions)
  if (!list.length)
    return ''
  return `<div class="reactions">${list.map(([e, n]) => `<span class="reaction">${e} ${n}</span>`).join('')}</div>`
}

export function messageHtml(m: Message): string {
  const mine = m.user.id === ME.id
  const head = m.first && !mine
  return `
${m.day ? `<div class="day"><span>${dayLabel(m)}</span></div>` : ''}
<div class="row${mine ? ' mine' : ''}${m.first ? ' first' : ''}">
  ${mine ? '' : head ? `<div class="avatar" style="--c:${m.user.color}">${initials(m.user.name)}</div>` : '<div class="avatar-gap"></div>'}
  <div class="bubble">
    ${head ? `<div class="author" style="--c:${m.user.color}">${esc(m.user.name)}</div>` : ''}
    ${m.reply ? `<a class="reply" href="#${m.reply.id}" data-reply="${m.reply.id}" style="--c:${m.reply.user.color}"><b>${esc(m.reply.user.name)}</b><span>${esc(m.reply.text)}</span></a>` : ''}
    ${m.image ? `<img class="photo" alt="" src="${imageUrl(m)}">` : ''}
    <div class="text${m.long ? ' collapsed' : ''}">${esc(m.text)}</div>
    ${m.long ? '<button class="more" type="button">Показать полностью</button>' : ''}
    ${m.code ? `<pre class="code">${esc(m.code)}</pre>` : ''}
    <div class="meta">${reactionsHtml(m)}<span class="num">#${m.id}</span><time>${timeOf(m)}</time></div>
  </div>
</div>`
}

export function renderMessage(m: Message): HTMLElement {
  const el = document.createElement('article')
  el.className = 'msg'
  el.dataset.id = String(m.id)
  el.innerHTML = messageHtml(m)
  return el
}
