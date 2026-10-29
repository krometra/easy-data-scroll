import '../shared/chat.css'
import { StrictMode, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { InfinityScroll, type InfinityScrollHandle } from '@krometra/easy-data-scroll/react'
import { ME, type Message as Msg } from '../shared/backend'
import { dayLabel, imageUrl, initials, timeOf } from '../shared/message'
import { chatShell } from '../shared/shell'

const shell = chatShell()

function Message({ m }: { m: Msg }) {
  const mine = m.user.id === ME.id
  const head = m.first && !mine
  const reactions = Object.entries(m.reactions)
  return (
    <article className="msg" data-id={m.id}>
      {m.day && <div className="day"><span>{dayLabel(m)}</span></div>}
      <div className={`row${mine ? ' mine' : ''}${m.first ? ' first' : ''}`}>
        {!mine && (head
          ? <div className="avatar" style={{ '--c': m.user.color } as React.CSSProperties}>{initials(m.user.name)}</div>
          : <div className="avatar-gap" />)}
        <div className="bubble">
          {head && <div className="author" style={{ '--c': m.user.color } as React.CSSProperties}>{m.user.name}</div>}
          {m.reply && (
            <a className="reply" href={`#${m.reply.id}`} data-reply={m.reply.id} style={{ '--c': m.reply.user.color } as React.CSSProperties}>
              <b>{m.reply.user.name}</b><span>{m.reply.text}</span>
            </a>
          )}
          {m.image && <img className="photo" alt="" src={imageUrl(m)} />}
          <div className={`text${m.long ? ' collapsed' : ''}`}>{m.text}</div>
          {m.long && <button className="more" type="button">Показать полностью</button>}
          {m.code && <pre className="code">{m.code}</pre>}
          <div className="meta">
            {reactions.length > 0 && (
              <div className="reactions">
                {reactions.map(([e, n]) => <span key={e} className="reaction">{e} {n}</span>)}
              </div>
            )}
            <span className="num">#{m.id}</span><time>{timeOf(m)}</time>
          </div>
        </div>
      </div>
    </article>
  )
}

const renderItem = (m: Msg) => <Message m={m} />

function App() {
  const ref = useRef<InfinityScrollHandle<Msg>>(null)
  useEffect(() => {
    if (ref.current?.list)
      shell.attach(ref.current.list)
  }, [])
  return (
    <InfinityScroll<Msg>
      ref={ref}
      className="list"
      origin="bottom"
      getKey={shell.getKey}
      loadBefore={shell.loadBefore}
      loadAfter={shell.loadAfter}
      onStickChange={shell.onStick}
      renderItem={renderItem}
    />
  )
}

createRoot(document.querySelector('#app')!).render(<StrictMode><App /></StrictMode>)
