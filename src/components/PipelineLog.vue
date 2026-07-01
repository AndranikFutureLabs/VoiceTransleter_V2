<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

const logRef = ref<HTMLDivElement>()
const entries = ref<{ text: string; class: string }[]>([])

function addEntry(msg: string) {
  let cls = 'log-info'
  if (msg.includes('❌') || msg.includes('Error') || msg.includes('Ошибка')) {
    cls = 'log-error'
  } else if (msg.includes('✅') || msg.includes('Done') || msg.includes('Готово')) {
    cls = 'log-success'
  } else if (msg.startsWith('[')) {
    cls = 'log-step'
  }
  entries.value.push({ text: msg, class: cls })
  nextTick(() => {
    if (logRef.value) {
      logRef.value.scrollTop = logRef.value.scrollHeight
    }
  })
}

function clear() {
  entries.value = []
}

defineExpose({ addEntry, clear })
</script>

<template>
  <div
    v-show="visible"
    ref="logRef"
    class="h-44 overflow-y-auto bg-gray-800 rounded-xl p-3 border border-gray-700"
  >
    <p
      v-for="(entry, i) in entries"
      :key="i"
      :class="['log-entry', entry.class]"
    >
      {{ entry.text }}
    </p>
    <p v-if="entries.length === 0" class="text-gray-500 text-xs italic">
      Лог обработки...
    </p>
  </div>
</template>
