<script setup lang="ts">
import { computed } from 'vue'
import { ME, type Message } from '../shared/backend'
import { dayLabel, imageUrl, initials, timeOf } from '../shared/message'

const props = defineProps<{ m: Message }>()
const mine = computed(() => props.m.user.id === ME.id)
const head = computed(() => props.m.first && !mine.value)
const reactions = computed(() => Object.entries(props.m.reactions))
</script>

<template>
  <article class="msg" :data-id="m.id">
    <div v-if="m.day" class="day">
      <span>{{ dayLabel(m) }}</span>
    </div>
    <div class="row" :class="{ mine, first: m.first }">
      <template v-if="!mine">
        <div v-if="head" class="avatar" :style="{ '--c': m.user.color }">
          {{ initials(m.user.name) }}
        </div>
        <div v-else class="avatar-gap" />
      </template>
      <div class="bubble">
        <div v-if="head" class="author" :style="{ '--c': m.user.color }">
          {{ m.user.name }}
        </div>
        <a v-if="m.reply" class="reply" :href="`#${m.reply.id}`" :data-reply="m.reply.id" :style="{ '--c': m.reply.user.color }">
          <b>{{ m.reply.user.name }}</b><span>{{ m.reply.text }}</span>
        </a>
        <img v-if="m.image" class="photo" alt="" :src="imageUrl(m)">
        <div class="text" :class="{ collapsed: m.long }">{{ m.text }}</div>
        <button v-if="m.long" class="more" type="button">
          Показать полностью
        </button>
        <pre v-if="m.code" class="code">{{ m.code }}</pre>
        <div class="meta">
          <div v-if="reactions.length" class="reactions">
            <span v-for="[e, n] in reactions" :key="e" class="reaction">{{ e }} {{ n }}</span>
          </div>
          <span class="num">#{{ m.id }}</span><time>{{ timeOf(m) }}</time>
        </div>
      </div>
    </div>
  </article>
</template>
