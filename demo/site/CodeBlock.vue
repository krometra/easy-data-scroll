<script setup lang="ts">
import { useToast } from '@krometra/ui-kit'

const props = defineProps<{ code: string }>()
const toast = useToast()

async function copy() {
  await navigator.clipboard.writeText(props.code)
  toast.success('Скопировано')
}
</script>

<template>
  <div class="code-block">
    <KButton class="code-block__copy" size="sm" variant="ghost" icon="copy" title="Скопировать" @click="copy" />
    <pre><code>{{ code }}</code></pre>
  </div>
</template>

<style scoped>
.code-block {
  position: relative;
  background: var(--k-surface-muted);
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius-sm);
}
.code-block pre {
  margin: 0;
  padding: 0.875rem 3rem 0.875rem 0.875rem;
  font-family: var(--k-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--k-text);
  overflow-x: auto;
}
.code-block__copy {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
}
</style>
