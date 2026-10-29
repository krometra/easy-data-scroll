import { useRef } from 'react'
import { describe, expectTypeOf, it } from 'vitest'
import { InfinityScroll, type InfinityScrollHandle } from '../src/react'

interface Msg {
  id: number
  text: string
}

declare function fetchRows(from: number, to: number): Promise<{ items: Msg[], total: number }>

function Chat() {
  const ref = useRef<InfinityScrollHandle<Msg>>(null)
  return (
    <InfinityScroll
      ref={ref}
      getKey={m => m.id}
      loadRange={fetchRows}
      renderItem={(m) => {
        expectTypeOf(m).toEqualTypeOf<Msg>()
        return m.text
      }}
      onVisibleChange={(range) => {
        expectTypeOf(range?.first).toEqualTypeOf<Msg | undefined>()
      }}
    />
  )
}

describe('типы react', () => {
  it('renderItem и колбэки получают тип строки из загрузчика', () => {
    expectTypeOf(Chat).toBeFunction()
  })
})
