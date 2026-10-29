import {
  ApplicationRef,
  createComponent,
  EnvironmentInjector,
  inject,
  type ComponentRef,
  type Injector,
  type InputSignalWithTransform,
  type Type,
} from '@angular/core'
import type { InfinityScrollOptions } from './core.js'

export interface AngularRendererOptions<K extends PropertyKey = 'item'> {
  environmentInjector?: EnvironmentInjector
  elementInjector?: Injector
  appRef?: ApplicationRef
  input?: K
}

export type AngularRenderer<T> = Pick<InfinityScrollOptions<T>, 'render' | 'update' | 'unmount'>

export type InputValue<V> = V extends InputSignalWithTransform<any, infer W> ? W : V

export function angularRenderer<C, K extends keyof C & string = 'item' & keyof C>(
  component: Type<C>,
  options: AngularRendererOptions<K> = {},
): AngularRenderer<InputValue<C[K]>> {
  type T = InputValue<C[K]>
  const environmentInjector = options.environmentInjector ?? inject(EnvironmentInjector)
  const appRef = options.appRef ?? inject(ApplicationRef)
  const input: string = options.input ?? 'item'
  const refs = new WeakMap<HTMLElement, ComponentRef<C>>()

  return {
    render(item: T, host: HTMLElement) {
      const ref = createComponent(component, { environmentInjector, elementInjector: options.elementInjector })
      ref.setInput(input, item)
      appRef.attachView(ref.hostView)
      ref.changeDetectorRef.detectChanges()
      refs.set(host, ref)
      return ref.location.nativeElement as HTMLElement
    },
    update(item: T, host: HTMLElement) {
      const ref = refs.get(host)
      if (!ref)
        return
      ref.setInput(input, item)
      ref.changeDetectorRef.detectChanges()
    },
    unmount(_item: T, host: HTMLElement) {
      const ref = refs.get(host)
      if (!ref)
        return
      refs.delete(host)
      appRef.detachView(ref.hostView)
      ref.destroy()
    },
  }
}
