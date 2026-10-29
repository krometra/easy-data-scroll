# @krometra/easy-data-scroll

Бесконечный и виртуальный скролл для чатов, лент и таблиц с элементами разной
высоты. Ядро на чистом DOM без зависимостей (12 КБ gzip), тонкие адаптеры для
Vue 3, React 18/19 и Angular 17+, типы на TypeScript с выводом дженериков.

**Витрина и примеры кода: <https://krometra.github.io/easy-data-scroll/>**

Главное: **ничего не прыгает**. Ни когда сверху подгружается история, ни когда
снизу прилетают новые сообщения, ни когда догружаются картинки или меняется
ширина окна. При этом в DOM только то, что рядом с экраном: около 20 элементов
на 100 000 в истории.

## Установка

```bash
npm install @krometra/easy-data-scroll
# или из репозитория по тегу
npm install github:krometra/easy-data-scroll#v0.2.0
```

Публикация в npm происходит по тегу `v*`: workflow `publish.yml` выкладывает пакет через
Trusted Publishing (OIDC), токен в секретах не нужен. Версию, которая уже есть в npm,
он пропускает.
Фреймворки — необязательные peer-зависимости: ставится только тот, которым
пользуетесь.

## Два режима

Как `scrolling.mode` в DevExpress: режим выбирается загрузчиком.

| | `infinite` (по умолчанию) | `virtual` |
|---|---|---|
| Загрузчик | `loadBefore` / `loadAfter`: «дай ещё перед этим элементом» | `loadRange(from, to)`: «дай строки с такой по такую» |
| Ползунок | по загруженному, растёт по мере подгрузки | сразу на весь список (`total`), можно утащить в любое место |
| Пока данных нет | спиннер у края | серые плашки на месте строк |
| Память | всё загруженное остаётся в модели | далёкое выгружается, держится не больше `maxItems` |
| Когда брать | лента, чат с курсором (`before=id`) | чат или таблица с номерами строк (`offset/limit`) и известным общим числом |

В обоих режимах DOM виртуальный: рендерится только окно у экрана.

## Почему не прыгает

Обычная виртуализация прыгает, потому что элемент сначала появляется с неизвестной высотой, потом его меряют и правят `scrollTop` прямо посреди прокрутки колесом или пальцем. Здесь по-другому:

1. **Начало отсчёта скролла там, где лента прирастает реже.** У чата это низ (`flex-direction: column-reverse`): `scrollTop` считается от низа, и история, которая подгружается сверху, физически не может сдвинуть экран. У ленты, наоборот, верх.
2. **Новое сначала меряется вне списка.** Элементы рендерятся в скрытом контейнере той же ширины, дожидаются картинок (до `mediaTimeout`) и только потом встают в список с уже известной высотой.
3. **Высота обёртки каждого элемента задана явно** и всегда равна модели. Если содержимое поменялось (раскрыли сообщение, догрузилась картинка), это ловит `ResizeObserver`, и модель обновляется по правилам:
   - элемент дальше экрана: обновляется сразу, на экран не влияет;
   - элемент на экране: обновляется сразу, край со стороны начала отсчёта стоит на месте;
   - элемент между экраном и началом отсчёта: нужна поправка `scrollTop`. Пока пользователь крутит колесо, держит палец или ползунок, поправка ждёт паузы. Элемент в это время за экраном, поэтому ожидание не видно.
4. **Высоты округляются до целых пикселей**, поэтому поправки точные и в WebKit, где `scrollTop` целый.

Невидимые элементы заменяются распорками точной высоты, а их DOM-узлы уходят в кэш (по умолчанию 400 штук). Если вернуться к ним, вставляются те же узлы с уже загруженными картинками.

В режиме `virtual` незагруженные участки хранятся в модели как «пропуски»: одна запись на участок с числом строк и оценочной высотой (средняя по уже измеренным). Ползунок поэтому сразу на весь список. Когда данные приходят, разница между оценкой и настоящей высотой уходит в соседний пропуск между экраном и началом отсчёта. Пропуск за экраном и всё равно оценочный, поэтому `scrollTop` не трогается, и на экране ничего не двигается. После `scrollToIndex` закреплена сама целевая строка: она остаётся на месте, пока вокруг догружаются данные и картинки, до первого действия пользователя. Далёкие загруженные строки сворачиваются обратно в пропуск с их точной суммарной высотой, поэтому выгрузка тоже ничего не сдвигает.

## Чистый JS

```ts
import { InfinityScroll } from '@krometra/easy-data-scroll'

const list = new InfinityScroll<Message>(document.querySelector('#chat')!, {
  origin: 'bottom',
  getKey: m => m.id,
  render: m => renderMessage(m),
  loadBefore: m => api.history({ before: m?.id }),
  loadAfter: m => api.history({ after: m!.id }),
  onStickChange: stuck => downButton.hidden = stuck,
})

socket.on('message', m => list.append([m]))
```

Контейнеру нужна высота (`height`, `flex: 1` и т. п.): внутри он `contain: strict`.

`loadBefore`/`loadAfter` получают крайний загруженный элемент (или `undefined` при первой загрузке) и возвращают массив или `{ items, done }`. Пустой массив или `done: true` означает, что дальше ничего нет. При первой загрузке вызывается загрузчик дальней стороны: у чата `loadBefore(undefined)` (последние сообщения), у ленты `loadAfter(undefined)`.

### Виртуальный режим

```ts
const list = new InfinityScroll(el, {
  mode: 'virtual',
  origin: 'bottom',
  total: 100_000,
  getKey: m => m.id,
  render: m => renderMessage(m),
  loadRange: (from, to) => api.messages({ offset: from, limit: to - from }),
})

list.scrollToIndex(31_336, { align: 'start' })
```

`loadRange(from, to)` получает номера строк (`to` не включительно, страницы по `pageSize`) и возвращает массив или `{ items, total }`. Если `total` в ответе отличается от текущего, хвост списка достраивается или обрезается. Без `total` список растёт на страницу вперёд, пока не придёт неполная страница. Для чата `total` лучше передать сразу, иначе первым запросом уйдёт `loadRange(0, pageSize)`, чтобы его узнать.

#### Общее число строк и фильтры

`total` обычно приходит с бэкенда вместе со страницей (`totalCount`): верните его в `{ items, total }`, и ползунок подстроится. Список сообщает новое общее число в `onTotalChange(total)`, а `setTotal(n)` задаёт его снаружи (например, из отдельного запроса количества): хвост списка достраивается или обрезается.

Когда меняются фильтры, данные другие целиком: вызовите `reset()` (в адаптерах достаточно поменять `query`). Без `total` в опциях сброса число берётся из первого ответа, `reset(undefined, { total: n })` задаёт его сразу.

```vue
<InfinityScroll
  mode="virtual"
  v-model:total="total"
  :query="filters"
  :load-range="(from, to) => api.messages({ ...filters, offset: from, limit: to - from })"
  :get-key="m => m.id"
>
```

`v-model:total` во Vue получает число из ответов и задаёт его, `query` — любое значение (объект сравнивается по содержимому): поменялось — список перезагружается. В React то же: `total`, `query`, `onTotalChange`.

Строки грузятся страницами по `pageSize`, ближние к экрану первыми, не больше 4 запросов одновременно, повторные на те же строки не шлются. Запас подгрузки растёт со скоростью прокрутки (скорость × среднее время загрузки страницы), поэтому при обычной быстрой прокрутке колесом данные приходят раньше, чем до них доезжает экран. Пока ползунок тащат быстро, запросы не уходят: страница грузится, когда он остановился или замедлился.

## Vue 3

```vue
<script setup lang="ts">
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
</template>
```

Элементы рендерятся через `Teleport` из самого компонента, поэтому `provide/inject`, плагины и реактивность работают как обычно. Методы (`append`, `scrollToKey`, …) доступны через `ref`.

Компонент обобщённый: тип строки выводится из `load-range`, `load-before` или `get-key`, и в слоте `item` уже нужного типа, без `as`. Виртуальный режим — те же пропсы, что у ядра: `mode="virtual"`, `:total`, `:load-range`.

## React 18/19

```tsx
import { InfinityScroll, type InfinityScrollHandle } from '@krometra/easy-data-scroll/react'

const ref = useRef<InfinityScrollHandle<Message>>(null)

<InfinityScroll
  ref={ref}
  className="chat"
  origin="bottom"
  getKey={m => m.id}
  loadBefore={m => api.history({ before: m?.id })}
  renderItem={renderMessage}
  onStickChange={setStuck}
/>
```

Тип строки выводится из загрузчика и доходит до `renderItem` и колбэков. Элементы рендерятся порталами из одного дерева: контекст, Suspense и StrictMode работают. `renderItem` лучше держать стабильным (вынести из компонента или обернуть в `useCallback`), иначе на каждый ререндер родителя перерисуются все видимые элементы.

## Angular 17+

```ts
import { InfinityScroll } from '@krometra/easy-data-scroll'
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
}
```

`angularRenderer` создаёт компонент через `createComponent`, передаёт элемент во вход `item` (имя меняется опцией `input`) и подключает его к `ApplicationRef`. Тип строки берётся из этого входа, обычного `@Input()` или сигнального `input()`, поэтому `new InfinityScroll(...)` выводит его сам. Вызывать в контексте внедрения (поле класса, конструктор) или передать `environmentInjector` и `appRef` явно. Для `update()` передавайте новый объект: `setInput` с тем же объектом OnPush-компонент не перерисует.

## Типы

Пакет написан на TypeScript и поставляет `.d.ts`. Дженерик `T` (тип строки) нигде не нужно писать руками:

| Где | Откуда берётся `T` | Куда доходит |
|---|---|---|
| `new InfinityScroll(el, opts)` | `loadRange`, `loadBefore`/`loadAfter`, `items`, `render` | `items`, `get()`, `onVisibleChange`, все колбэки |
| Vue `<InfinityScroll>` | `:load-range`, `:load-before`, `:get-key` | слот `#default="{ item }"`, `@visible`, `InfinityScrollExpose<T>` |
| React `<InfinityScroll>` | `loadRange`, `loadBefore`, `getKey` | `renderItem`, `onVisibleChange`, `InfinityScrollHandle<T>` |
| Angular `angularRenderer(Component)` | вход `item` компонента (`@Input()` или `input()`) | `render`/`update` и `new InfinityScroll(...)` |

Вывод проверяется тестами типов (`test/types.test.ts`, `test/react-types.test.tsx`), а шаблоны Vue — `vue-tsc` на TypeScript 5.9 против собранного пакета.

## Любой другой фреймворк

Адаптер описывается четырьмя функциями:

```ts
render(item, host)   // отрисовать элемент внутрь host (или вернуть DOM-узел)
update(item, host)   // перерисовать с новыми данными
unmount(item, host)  // убрать
commit()             // дорисовать накопленное; можно вернуть Promise
```

Ядро не требует, чтобы содержимое появилось синхронно: высота обёртки задана заранее, поэтому асинхронный рендер не сдвигает раскладку.

## Опции

| Опция | По умолчанию | Что делает |
|---|---|---|
| `getKey(item)` | обязательна | Уникальный ключ элемента |
| `render(item, host)` | обязательна | Отрисовка; можно вернуть узел |
| `update`, `unmount`, `commit` | | Хуки для фреймворков |
| `origin` | `'top'` | `'bottom'` — чат: начинается снизу, прилипает к низу, история грузится сверху |
| `mode` | по загрузчику | `'infinite'` или `'virtual'` |
| `loadBefore`, `loadAfter` | | Загрузчики сторон (`infinite`) |
| `loadRange(from, to)` | | Загрузчик строк по номерам (`virtual`) |
| `total` | | Сколько всего строк (`virtual`) |
| `pageSize` | 50 | По сколько строк запрашивать (`virtual`) |
| `estimatedHeight` | 60 | Оценка высоты строки, пока ничего не измерено (`virtual`) |
| `maxItems` | 1000 | Сколько загруженных строк держать, остальное выгружается (`virtual`) |
| `items`, `hasBefore`, `hasAfter`, `anchor` | | Стартовые данные без первой загрузки |
| `overscan` | высота экрана | Сколько пикселей рендерить за краями экрана |
| `threshold` | 2 экрана, не меньше 1200; в `virtual` 4 экрана, не меньше 2400 | За сколько пикселей до края начинать подгрузку |
| `cacheSize` | 400 | Сколько отрисованных узлов держать вне DOM |
| `mediaTimeout` | 1500 | Сколько ждать картинки при замере, мс |
| `idleDelay` | 150 | Пауза после прокрутки, после которой можно править позицию, мс |
| `animate` | `true` | Плавное появление новых сообщений у низа (`{ duration, easing }`) |
| `renderLoader(side)` | спиннер | Свой индикатор загрузки (`null` — без него) |
| `onStickChange(stuck)` | | Прилип ли список к началу отсчёта (для кнопки «вниз») |
| `onVisibleChange(range)` | | Первый и последний видимые элементы (для «прочитано») |
| `onLoadStateChange(side, state, error)` | | `idle`, `loading`, `done`, `error`; в `virtual` `side` равен `'range'` |
| `onTotalChange(total)` | | Общее число строк изменилось: пришло с бэкенда, задано через `setTotal`, добавились или удалились строки (`virtual`) |

## Методы

| Метод | Что делает |
|---|---|
| `append(items)`, `prepend(items)` | Добавить в конец/начало. Если с этой стороны ещё есть незагруженное (`hasAfter`), игнорируется: такие элементы придут загрузчиком |
| `update(key, item?)` | Перерисовать элемент |
| `remove(key)` | Удалить |
| `reset(items?, { anchor, align, hasBefore, hasAfter, total, index })` | Заменить всё, например прыжок к сообщению из поиска или смена фильтров. Без `items` загружает заново. В `virtual`: `items` встают с строки `index`, `total` задаёт новое общее число, `total: null` — взять его из первого ответа |
| `scrollToKey(key, { align, behavior, offset })` | Прокрутить к загруженному элементу |
| `scrollToIndex(index, { align, behavior, offset })` | Прокрутить к строке по номеру. В `virtual` строка может быть не загружена: она догрузится и останется на месте |
| `indexOfKey(key)` | Номер строки загруженного элемента или `-1` |
| `setTotal(n)` | Задать общее число строк (`virtual`): хвост достраивается плашками или обрезается |
| `scrollToTop()`, `scrollToBottom()` | К краю. Если край не загружен (после прыжка), список перезагружается |
| `refresh()` | Перемерить всё, например после смены шрифта или темы |
| `destroy()` | Снять всё |

Свойства: `mode`, `items` (загруженные), `size` (сколько загружено), `total` (сколько строк всего), `isStuck`, `hasMore`, `loadState`, `stats`, `viewport`, `content`.

## Стили

```css
.chat { height: 100%; --eds-loader-color: #3b82f6; }
.chat .eds-content { padding: 12px 0; }
```

- Отступы между элементами делайте внутри элемента (`margin` или `padding`): обёртка — `display: flow-root`, отступы учитываются в высоте.
- Обёртка элемента — `contain: size layout style`, это и даёт скорость. Побочный эффект: `position: fixed` внутри элемента считается от обёртки. Всплывающие меню выносите в `body` (порталы, `Teleport`, CDK Overlay).
- Селекторы вида `.eds-viewport .message` не попадут в скрытый контейнер для замеров. Вешайте стили на класс самого элемента или корня списка.
- Плашки незагруженных строк в `virtual` — `.eds-gap` с повторяющимся фоном. Цвет и отступы: `--eds-gap-color`, `--eds-gap-inset`, `--eds-gap-pad`; высота одной строки (средняя измеренная) приходит в `--eds-row` на корне списка. Можно задать свой `background` под вид своих строк (в демо чата это кружок аватара и пузырь). Вертикальную позицию фона библиотека ставит сама (`background-position-y`), чтобы рисунок не прыгал, пока вокруг догружаются данные: двигается он только вместе с прокруткой. Строки, пришедшие на место видимых плашек, проявляются за 180 мс (отключается `animate: false`).

## Ограничения

- Автотестами проверено в Chrome и WebKit (движок Safari). Firefox пока только руками.
- Элемент нулевой высоты не поддерживается: для скрытия используйте `remove()`.
- Выделение текста и фокус внутри элемента, который ушёл далеко за экран, теряются (узел вынимается из DOM).
- `reset()` с тысячами элементов разом меряет их одной пачкой (~1,5 с на 4000 сообщений). Нормальный размер страницы — 20–100.
- Браузеры считают координаты во float32 и теряют точность выше 16,7 млн px (Firefox вообще не рисует блоки выше ~17,9 млн). Поэтому `virtual` держит высоту списка не больше 15 млн px: если строк много, незагруженные участки сжимаются, загруженные остаются в настоящую высоту. Ползунок на миллионах строк становится неравномерным, но до любой строки по-прежнему можно дотащить. В `infinite` такого сжатия нет: история выше ~100 тыс. сообщений в одной сессии упрётся в этот предел.
- `virtual`: картинка без заданных размеров, не успевшая загрузиться за `mediaTimeout`, вырастет уже на экране. Задавайте `width`/`height` или `aspect-ratio`, это стоит делать в любом режиме.

## Разработка

```bash
npm install
npm run dev          # витрина и песочницы на localhost:5179
npm run typecheck    # типы, включая тесты типов
npm test             # юнит-тесты и тесты типов (vitest)
npm run build        # сборка библиотеки в dist/ (ESM и d.ts)
npm run build:demo   # сборка витрины для GitHub Pages (BASE=/easy-data-scroll/)
npm run e2e          # Playwright: Chrome и WebKit
npm run check        # всё вместе
```

Витрина (`demo/index.html`, `demo/site/`) собрана на [@krometra/ui-kit](https://krometra.github.io/ui-kit/) и служит документацией: живой пример, код подключения для каждого фреймворка, опции и методы. Рядом песочницы для проверки руками и e2e: чат с панелью счётчиков (`chat.html`), лента, виртуальный режим, Vue, React и Angular. На панели песочницы видно, сколько элементов в DOM, сколько раз библиотека писала `scrollTop`, сколько из них пришлось на время прокрутки (должно быть 0) и сколько раз содержимое сдвинулось само (тоже 0).

## Что изменилось в 0.2.0

- Общее число строк и фильтры в `virtual`: `setTotal(n)`, колбэк `onTotalChange(total)`,
  `reset(undefined, { total: null })` берёт число из первого ответа.
- Vue: `v-model:total` и проп `query` (сменился — список перезагружается). React:
  `total` и `query` реактивные, `onTotalChange`.
- Витрина: фильтр по автору в виртуальном режиме, `total` приходит с бэкенда.

## Что изменилось в 0.1.0

- Первый выпуск в организации Крометры: пакет `@krometra/easy-data-scroll`,
  репозиторий `github.com/krometra/easy-data-scroll`, витрина на GitHub Pages.
- Два режима: `infinite` (подгрузка у края) и `virtual` (ползунок на весь
  список, строки по номерам, выгрузка далёкого, `scrollToIndex`).
- Адаптеры Vue, React и Angular с выводом типа строки из загрузчика или
  компонента.

## Лицензия

MIT
