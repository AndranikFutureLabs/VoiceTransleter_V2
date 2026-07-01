<script setup lang="ts">
import { ref, nextTick } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

const logRef = ref<HTMLDivElement>()
const entries = ref<{ text: string; class: string; time: string }[]>([])

function addEntry(msg: string) {
  let cls = 'log-info'
  if (msg.includes('❌') || msg.includes('Error') || msg.includes('Ошибка')) {
    cls = 'log-error'
  } else if (msg.includes('✅') || msg.includes('Done') || msg.includes('Готово') || msg.includes('завершён')) {
    cls = 'log-success'
  } else if (msg.startsWith('[') && msg.includes('/')) {
    cls = 'log-step'
  }

  const now = new Date()
  const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  entries.value.push({ text: msg, class: cls, time })

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
    class="h-48 overflow-y-auto bg-gray-800/80 rounded-xl p-3 border border-gray-700 font-mono text-xs leading-relaxed"
  >
    <div v-if="entries.length === 0" class="text-gray-500 italic">
      Ожидание запуска...
    </div>
    <div
      v-for="(entry, i) in entries"
      :key="i"
      class="py-0.5"
    >
      <span class="text-gray-600 mr-2 select-none">{{ entry.time }}</span>
      <span :class="[entry.class]">{{ entry.text }}</span>
    </div>
  </div>
</template>
