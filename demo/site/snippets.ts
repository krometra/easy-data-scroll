export type Framework = 'js' | 'vue' | 'react' | 'angular'
export type Mode = 'infinite' | 'virtual'

export const install = 'npm install @krometra/easy-data-scroll'

export const snippets: Record<Framework, Record<Mode, string>> = {
  js: {
    infinite: `import { InfinityScroll } from '@krometra/easy-data-scroll'

const list = new InfinityScroll<Message>(document.querySelector('#chat')!, {
  origin: 'bottom',
  getKey: m => m.id,
  render: m => renderMessage(m),
  loadBefore: m => api.history({ before: m?.id }),
  loadAfter: m => api.history({ after: m!.id }),
  onStickChange: stuck => (downButton.hidden = stuck),
})

socket.on('message', m => list.append([m]))`,
    virtual: `import { InfinityScroll } from '@krometra/easy-data-scroll'

const list = new InfinityScroll(document.querySelector('#chat')!, {
  mode: 'virtual',
  origin: 'bottom',
  total: 100_000,
  getKey: m => m.id,
  render: m => renderMessage(m),
  loadRange: (from, to) => api.messages({ offset: from, limit: to - from }),
})

list.scrollToIndex(31_336, { align: 'start' })`,
  },
  vue: {
    infinite: `<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { InfinityScroll, type InfinityScrollExpose } from '@krometra/easy-data-scroll/vue'

const scroll = useTemplateRef<InfinityScrollExpose<Message>>('scroll')
</script>

<template>
  <InfinityScroll
    ref="scroll"
    class="chat"
    origin="bottom"
    :get-key="m => m.id"
    :load-before="m => api.history({ before: m?.id })"
    @stick="stuck => (showDown = !stuck)"
  >
    <template #default="{ item }">
      <MessageCard :m="item" />
    </template>
  </InfinityScroll>
</template>`,
    virtual: `<script setup lang="ts">
import { InfinityScroll } from '@krometra/easy-data-scroll/vue'

function loadRange(from: number, to: number) {
  return api.messages({ offset: from, limit: to - from })
}
</script>

<template>
  <InfinityScroll
    class="chat"
    mode="virtual"
    origin="bottom"
    :total="total"
    :get-key="m => m.id"
    :load-range="loadRange"
  >
    <template #default="{ item }">
      <MessageCard :m="item" />
    </template>
  </InfinityScroll>
</template>`,
  },
  react: {
    infinite: `import { useRef } from 'react'
import { InfinityScroll, type InfinityScrollHandle } from '@krometra/easy-data-scroll/react'

export function Chat() {
  const ref = useRef<InfinityScrollHandle<Message>>(null)
  return (
    <InfinityScroll
      ref={ref}
      className="chat"
      origin="bottom"
      getKey={m => m.id}
      loadBefore={m => api.history({ before: m?.id })}
      renderItem={renderMessage}
    />
  )
}`,
    virtual: `import { InfinityScroll } from '@krometra/easy-data-scroll/react'

export function Chat({ total }: { total: number }) {
  return (
    <InfinityScroll
      className="chat"
      mode="virtual"
      origin="bottom"
      total={total}
      getKey={m => m.id}
      loadRange={(from, to) => api.messages({ offset: from, limit: to - from })}
      renderItem={renderMessage}
    />
  )
}`,
  },
  angular: {
    infinite: `import { InfinityScroll } from '@krometra/easy-data-scroll'
import { angularRenderer } from '@krometra/easy-data-scroll/angular'

@Component({ selector: 'app-chat', template: '<div #list class="chat"></div>' })
export class ChatComponent implements AfterViewInit, OnDestroy {
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('list')
  private readonly renderer = angularRenderer(MessageComponent)
  private list?: InfinityScroll<Message>

  ngAfterViewInit() {
    this.list = new InfinityScroll(this.host().nativeElement, {
      ...this.renderer,
      origin: 'bottom',
      getKey: m => m.id,
      loadBefore: m => this.api.history(m?.id),
    })
  }

  ngOnDestroy() {
    this.list?.destroy()
  }
}`,
    virtual: `import { InfinityScroll } from '@krometra/easy-data-scroll'
import { angularRenderer } from '@krometra/easy-data-scroll/angular'

@Component({ selector: 'app-chat', template: '<div #list class="chat"></div>' })
export class ChatComponent implements AfterViewInit, OnDestroy {
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('list')
  private readonly renderer = angularRenderer(MessageComponent)
  private list?: InfinityScroll<Message>

  ngAfterViewInit() {
    this.list = new InfinityScroll(this.host().nativeElement, {
      ...this.renderer,
      mode: 'virtual',
      origin: 'bottom',
      total: this.total,
      getKey: m => m.id,
      loadRange: (from, to) => this.api.messages(from, to - from),
    })
  }

  ngOnDestroy() {
    this.list?.destroy()
  }
}`,
  },
}

export const notes: Record<Framework, string> = {
  js: 'Тип строки выводится из загрузчика: render, getKey и колбэки получают Message без явного дженерика.',
  vue: 'Компонент обобщённый: T выводится из load-range или load-before, и в слоте item уже типа Message. Методы — через ref.',
  react: 'Тип строки выводится из загрузчика и доходит до renderItem. Держите renderItem стабильным (вне компонента или useCallback).',
  angular: 'angularRenderer берёт тип из входа item компонента (обычного @Input или сигнального input()). Компоненты подключаются к ApplicationRef, DI работает.',
}
