<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { applyTheme, themes, useToast } from '@krometra/ui-kit'
import pkg from '../../package.json'
import CodeBlock from './CodeBlock.vue'
import LiveDemo from './LiveDemo.vue'
import { install, notes, snippets, type Framework, type Mode } from './snippets'

const github = 'https://github.com/krometra/easy-data-scroll'
const npm = 'https://www.npmjs.com/package/@krometra/easy-data-scroll'
const toast = useToast()

const theme = ref({ preset: 'default', scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' })
let restore = () => {}
watch(theme, (t) => {
  restore()
  restore = applyTheme({ ...t })
}, { immediate: true, deep: true })

function toggleScheme() {
  theme.value.scheme = theme.value.scheme === 'dark' ? 'light' : 'dark'
}

function openUrl(url: string) {
  window.open(url, '_blank', 'noopener')
}

async function copyInstall() {
  await navigator.clipboard.writeText(install)
  toast.success('Скопировано', install)
}

const framework = ref<Framework>('vue')
const mode = ref<Mode>('virtual')
const frameworks = [
  { value: 'js', label: 'Чистый JS' },
  { value: 'vue', label: 'Vue 3' },
  { value: 'react', label: 'React 18/19' },
  { value: 'angular', label: 'Angular 17+' },
]
const modes = [
  { value: 'virtual', label: 'Виртуальный' },
  { value: 'infinite', label: 'Бесконечный' },
]
const code = computed(() => snippets[framework.value][mode.value])

const principles = [
  { icon: 'move', title: 'Отсчёт от края, который растёт реже', text: 'У чата scrollTop считается от низа (column-reverse): история сверху физически не может сдвинуть экран.' },
  { icon: 'sliders', title: 'Сначала замер, потом вставка', text: 'Новые элементы рендерятся в скрытом контейнере той же ширины, ждут картинок и встают в список уже с известной высотой.' },
  { icon: 'grid', title: 'Высота обёртки из модели', text: 'Изменения размера ловит ResizeObserver; за экраном они бесплатны, а поправка позиции ждёт паузы в прокрутке.' },
  { icon: 'list', title: 'Пропуски вместо строк', text: 'В виртуальном режиме незагруженное — блоки с оценочной высотой. Разница с настоящей уходит в пропуск за экраном, scrollTop не трогается.' },
]

const modeColumns = [
  { key: 'axis', label: '' },
  { key: 'infinite', label: 'infinite' },
  { key: 'virtual', label: 'virtual' },
]
const modeRows = [
  { id: 1, axis: 'Загрузчик', infinite: 'loadBefore / loadAfter: «дай ещё перед этим элементом»', virtual: 'loadRange(from, to): «дай строки с такой по такую»' },
  { id: 2, axis: 'Ползунок', infinite: 'по загруженному, растёт с подгрузкой', virtual: 'сразу на весь список, тащится в любое место' },
  { id: 3, axis: 'Пока данных нет', infinite: 'спиннер у края', virtual: 'плашки на месте строк' },
  { id: 4, axis: 'Память', infinite: 'всё загруженное остаётся', virtual: 'далёкое выгружается, держится maxItems' },
  { id: 5, axis: 'Когда брать', infinite: 'лента, чат с курсором before=id', virtual: 'чат или таблица с offset/limit и общим числом' },
]

const optionColumns = [
  { key: 'name', label: 'Опция', nowrap: true },
  { key: 'def', label: 'По умолчанию', nowrap: true },
  { key: 'text', label: 'Что делает' },
]
const options = [
  { name: 'getKey(item)', def: 'обязательна', text: 'Уникальный ключ элемента' },
  { name: 'render(item, host)', def: 'обязательна', text: 'Отрисовка, можно вернуть узел. В адаптерах — слот, renderItem или компонент' },
  { name: 'origin', def: "'top'", text: "'bottom' — чат: начинается снизу и прилипает к низу" },
  { name: 'mode', def: 'по загрузчику', text: "'infinite' или 'virtual'" },
  { name: 'loadBefore, loadAfter', def: '', text: 'Загрузчики сторон для infinite' },
  { name: 'loadRange(from, to)', def: '', text: 'Загрузчик строк по номерам для virtual, возвращает массив или { items, total }' },
  { name: 'total, pageSize', def: '—, 50', text: 'Сколько всего строк и по сколько запрашивать (virtual)' },
  { name: 'estimatedHeight, maxItems', def: '60, 1000', text: 'Оценка высоты до первых замеров и сколько строк держать загруженными (virtual)' },
  { name: 'overscan, threshold', def: 'экран, 2–4 экрана', text: 'Запас рендера за краями и расстояние до края для подгрузки' },
  { name: 'mediaTimeout, idleDelay', def: '1500, 150', text: 'Сколько ждать картинки при замере и паузу после прокрутки, мс' },
  { name: 'animate', def: 'true', text: 'Плавное появление новых сообщений у низа и строк на месте плашек' },
  { name: 'onStickChange, onVisibleChange, onLoadStateChange', def: '', text: 'Прилип ли список к краю, видимый диапазон, состояние загрузки' },
]

const methodColumns = [
  { key: 'name', label: 'Метод', nowrap: true },
  { key: 'text', label: 'Что делает' },
]
const methods = [
  { name: 'append(items), prepend(items)', text: 'Добавить в конец или начало' },
  { name: 'update(key, item?), remove(key)', text: 'Перерисовать или удалить элемент' },
  { name: 'scrollToKey(key, opts)', text: 'Прокрутить к загруженному элементу' },
  { name: 'scrollToIndex(index, opts)', text: 'Прокрутить к строке по номеру; в virtual она догрузится и останется на месте' },
  { name: 'scrollToTop(), scrollToBottom()', text: 'К краю; если край не загружен, список перезагрузится' },
  { name: 'reset(items?, opts)', text: 'Заменить всё, например прыжок к сообщению из поиска' },
  { name: 'refresh(), destroy()', text: 'Перемерить всё после смены шрифта или темы, снять всё' },
]

const sandboxes = [
  { href: './chat.html', title: 'Чат с панелью счётчиков', text: 'Бесконечный режим, подгрузка истории, прыжки, сбои сети' },
  { href: './virtual.html', title: 'Виртуальный чат', text: 'Ползунок на 100 000 сообщений, выгрузка, таблица сверху' },
  { href: './feed.html', title: 'Лента', text: 'Отсчёт сверху, новые посты не сдвигают читаемое' },
  { href: './vue.html', title: 'Vue', text: 'Адаптер со слотом и Teleport' },
  { href: './react.html', title: 'React', text: 'Порталы из одного дерева, StrictMode' },
  { href: './angular.html', title: 'Angular', text: 'angularRenderer, DI и ApplicationRef' },
]
</script>

<template>
  <div class="showcase">
    <header class="showcase__hero">
      <div class="showcase__hero-inner">
        <div class="showcase__brand">
          <span class="showcase__logo"><KIcon name="list" :size="20" /></span>
          <div>
            <h1>@krometra/easy-data-scroll</h1>
            <p>Бесконечный и виртуальный скролл без прыжков</p>
          </div>
        </div>
        <div class="showcase__hero-actions">
          <KButton variant="secondary" :icon="theme.scheme === 'dark' ? 'sun' : 'moon'" title="Переключить схему" @click="toggleScheme" />
          <KButton variant="secondary" icon="external" @click="openUrl(github)">GitHub</KButton>
          <KButton variant="primary" icon="copy" @click="copyInstall">npm i @krometra/easy-data-scroll</KButton>
        </div>
      </div>
    </header>

    <main class="showcase__body">
      <section class="showcase__section">
        <div class="showcase__lead">
          <p>
            Ядро на чистом DOM без зависимостей ({{ pkg.version }}, 12 КБ gzip) и тонкие адаптеры для Vue, React и Angular.
            Высота элементов заранее не нужна: новое меряется до вставки, а поправки позиции не мешают колесу и пальцу.
          </p>
          <div class="showcase__presets">
            <button
              v-for="t in themes"
              :key="t.value"
              class="showcase__preset"
              :class="{ 'showcase__preset--active': theme.preset === t.value }"
              @click="theme.preset = t.value"
            >
              <span class="showcase__preset-dot" :style="{ background: t.accent }" />
              {{ t.label }}
            </button>
          </div>
        </div>
      </section>

      <section class="showcase__section">
        <h2 class="showcase__title">Как это работает</h2>
        <LiveDemo />
      </section>

      <section class="showcase__section">
        <h2 class="showcase__title">Подключение</h2>
        <KCard title="Пример кода" :subtitle="notes[framework]">
          <template #actions>
            <KSegmented v-model="mode" :options="modes" size="sm" />
          </template>
          <KTabs v-model="framework" :items="frameworks" />
          <div class="showcase__mt">
            <CodeBlock :code="install" />
          </div>
          <div class="showcase__mt">
            <CodeBlock :code="code" />
          </div>
        </KCard>
      </section>

      <section class="showcase__section">
        <h2 class="showcase__title">Почему не прыгает</h2>
        <div class="showcase__grid showcase__grid--2">
          <KCard v-for="p in principles" :key="p.title">
            <div class="showcase__principle">
              <span class="showcase__logo showcase__logo--sm"><KIcon :name="p.icon" :size="15" /></span>
              <div>
                <h3>{{ p.title }}</h3>
                <p>{{ p.text }}</p>
              </div>
            </div>
          </KCard>
        </div>
      </section>

      <section class="showcase__section">
        <h2 class="showcase__title">Два режима</h2>
        <KCard padding="none">
          <KTable :columns="modeColumns" :rows="modeRows">
            <template #cell-axis="{ row }">
              <span class="showcase__cell-name">{{ row.axis }}</span>
            </template>
          </KTable>
        </KCard>
      </section>

      <section class="showcase__section">
        <h2 class="showcase__title">Опции</h2>
        <KCard padding="none">
          <KTable :columns="optionColumns" :rows="options" row-key="name" dense>
            <template #cell-name="{ row }">
              <code class="showcase__code">{{ row.name }}</code>
            </template>
          </KTable>
        </KCard>
      </section>

      <section class="showcase__section">
        <h2 class="showcase__title">Методы</h2>
        <KCard padding="none">
          <KTable :columns="methodColumns" :rows="methods" row-key="name" dense>
            <template #cell-name="{ row }">
              <code class="showcase__code">{{ row.name }}</code>
            </template>
          </KTable>
        </KCard>
      </section>

      <section class="showcase__section">
        <h2 class="showcase__title">Песочницы</h2>
        <div class="showcase__grid showcase__grid--3">
          <a v-for="s in sandboxes" :key="s.href" :href="s.href" class="showcase__link">
            <KCard hoverable>
              <h3>{{ s.title }}</h3>
              <p>{{ s.text }}</p>
            </KCard>
          </a>
        </div>
      </section>

      <footer class="showcase__footer">
        <span>MIT · Krometra · версия {{ pkg.version }}</span>
        <span class="showcase__footer-links">
          <a :href="github" target="_blank" rel="noopener">GitHub</a>
          <a :href="npm" target="_blank" rel="noopener">npm</a>
          <a href="https://krometra.github.io/ui-kit/" target="_blank" rel="noopener">@krometra/ui-kit</a>
        </span>
      </footer>
    </main>
    <KToast />
  </div>
</template>

<style scoped>
.showcase { min-height: 100vh; }
.showcase__hero {
  background: linear-gradient(180deg, var(--k-surface) 0%, var(--k-bg) 100%);
  border-bottom: 1px solid var(--k-border);
}
.showcase__hero-inner {
  max-width: 1160px;
  margin: 0 auto;
  padding: 2.25rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.showcase__brand { display: flex; align-items: center; gap: 0.875rem; }
.showcase__brand h1 { font-size: 1.5rem; }
.showcase__brand p { margin-top: 0.2rem; color: var(--k-text-muted); font-size: 0.9375rem; }
.showcase__logo {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--k-radius);
  background: var(--k-primary);
  color: var(--k-on-primary);
  box-shadow: var(--k-shadow-md);
}
.showcase__logo--sm { width: 1.75rem; height: 1.75rem; border-radius: var(--k-radius-sm); box-shadow: none; }
.showcase__hero-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

.showcase__body { max-width: 1160px; margin: 0 auto; padding: 2rem 1.5rem 3rem; }
.showcase__section + .showcase__section { margin-top: 2.5rem; }
.showcase__title {
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--k-text-faint);
  margin-bottom: 0.75rem;
}
.showcase__lead p { color: var(--k-text-muted); max-width: 52rem; line-height: 1.6; }
.showcase__mt { margin-top: 1rem; }
.showcase__grid { display: grid; gap: 1rem; }
.showcase__grid--2 { grid-template-columns: repeat(auto-fit, minmax(min(100%, 30rem), 1fr)); }
.showcase__grid--3 { grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); }
.showcase__principle { display: flex; gap: 0.75rem; }
.showcase__principle h3,
.showcase__link h3 { font-size: 0.9375rem; margin-bottom: 0.3rem; }
.showcase__principle p,
.showcase__link p { color: var(--k-text-muted); font-size: 0.875rem; line-height: 1.55; }
.showcase__cell-name { font-weight: 500; }
.showcase__code {
  font-family: var(--k-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.78rem;
  color: var(--k-text);
}
.showcase__link { color: inherit; text-decoration: none; display: block; }
.showcase__link > :deep(.k-card),
.showcase__grid--2 > :deep(.k-card) { height: 100%; }

.showcase__presets { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 1rem; }
.showcase__preset {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  background: var(--k-surface);
  border: 1px solid var(--k-border-strong);
  border-radius: 999px;
  font: inherit;
  font-size: 0.8125rem;
  color: var(--k-text-muted);
  cursor: pointer;
}
.showcase__preset:hover { color: var(--k-text); }
.showcase__preset--active { border-color: var(--k-primary); color: var(--k-primary); font-weight: 600; }
.showcase__preset-dot { width: 0.7rem; height: 0.7rem; border-radius: 50%; }

.showcase__footer {
  margin-top: 3rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--k-border);
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  color: var(--k-text-faint);
  font-size: 0.8125rem;
}
.showcase__footer-links { display: flex; gap: 1rem; }
.showcase__footer a { color: var(--k-text-muted); text-decoration: none; }
.showcase__footer a:hover { color: var(--k-primary); }
</style>
