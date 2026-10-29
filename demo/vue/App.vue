<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { InfinityScroll, type InfinityScrollExpose } from '@krometra/easy-data-scroll/vue'
import type { Message as Msg } from '../shared/backend'
import { chatShell } from '../shared/shell'
import Message from './Message.vue'

const shell = chatShell()
const scroll = useTemplateRef<InfinityScrollExpose<Msg>>('scroll')

onMounted(() => shell.attach(scroll.value!.list!))
</script>

<template>
  <InfinityScroll
    ref="scroll"
    class="list"
    origin="bottom"
    :get-key="shell.getKey"
    :load-before="shell.loadBefore"
    :load-after="shell.loadAfter"
    @stick="shell.onStick"
  >
    <template #default="{ item }">
      <Message :m="item" />
    </template>
  </InfinityScroll>
</template>
