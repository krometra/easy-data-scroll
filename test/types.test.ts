import type { InputSignal } from '@angular/core'
import { describe, expectTypeOf, it } from 'vitest'
import { angularRenderer, type AngularRenderer } from '../src/angular'
import { InfinityScroll, type VisibleRange } from '../src/index'
import { InfinityScroll as VueScroll, type InfinityScrollExpose } from '../src/vue'

interface Msg {
  id: number
  text: string
}

declare const el: HTMLElement
declare function fetchRows(from: number, to: number): Promise<{ items: Msg[], total: number }>
declare function fetchPage(edge: Msg | undefined): Promise<Msg[]>

function coreVirtual() {
  return new InfinityScroll(el, {
    getKey: m => m.id,
    render: m => document.createTextNode(m.text),
    loadRange: fetchRows,
  })
}

function coreInfinite() {
  return new InfinityScroll(el, {
    getKey: m => m.id,
    render: m => document.createTextNode(m.text),
    loadBefore: fetchPage,
    onVisibleChange: (range) => {
      expectTypeOf(range).toEqualTypeOf<VisibleRange<Msg> | null>()
    },
  })
}

class SignalComponent {
  item!: InputSignal<Msg>
}

class DecoratorComponent {
  message!: Msg
}

function vueInferred() {
  return VueScroll({ getKey: m => m.id, loadRange: fetchRows })
}

describe('типы', () => {
  it('ядро выводит тип строки из загрузчика', () => {
    expectTypeOf(coreVirtual).returns.toEqualTypeOf<InfinityScroll<Msg>>()
    expectTypeOf(coreInfinite).returns.toEqualTypeOf<InfinityScroll<Msg>>()
    expectTypeOf<InfinityScroll<Msg>['items']>().toEqualTypeOf<Msg[]>()
    expectTypeOf<ReturnType<InfinityScroll<Msg>['get']>>().toEqualTypeOf<Msg | undefined>()
    expectTypeOf<InfinityScroll<Msg>['setTotal']>().toEqualTypeOf<(total: number) => void>()
    expectTypeOf<InfinityScroll<Msg>['total']>().toEqualTypeOf<number>()
  })

  it('angularRenderer берёт тип из входа компонента', () => {
    expectTypeOf<ReturnType<typeof angularRenderer<SignalComponent>>>().toEqualTypeOf<AngularRenderer<Msg>>()
    expectTypeOf<ReturnType<typeof angularRenderer<DecoratorComponent, 'message'>>>().toEqualTypeOf<AngularRenderer<Msg>>()
  })

  it('vue-компонент выводит T из пропсов и отдаёт его в слот и ref', () => {
    type Ctx = NonNullable<ReturnType<typeof vueInferred>['__ctx']>
    expectTypeOf<Parameters<NonNullable<Ctx['slots']['default']>>[0]>().toEqualTypeOf<{ item: Msg }>()
    expectTypeOf<Parameters<Ctx['expose']>[0]>().toEqualTypeOf<InfinityScrollExpose<Msg>>()
    expectTypeOf<Parameters<NonNullable<Ctx['props']['onVisible']>>[0]>().toEqualTypeOf<VisibleRange<Msg> | null>()
    expectTypeOf<Ctx['props']['onUpdate:total']>().toEqualTypeOf<((total: number) => void) | undefined>()
    expectTypeOf<Ctx['props']['query']>().toEqualTypeOf<unknown>()
  })
})
