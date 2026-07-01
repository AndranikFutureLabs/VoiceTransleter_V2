<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  value: number
  visible: boolean
}>()

const pct = computed(() => Math.round(props.value * 100))
</script>

<template>
  <div v-show="visible" class="flex items-center gap-3">
    <div class="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
      <div
        class="h-full bg-cyan-400 rounded-full transition-all duration-300 ease-out"
        :style="{ width: `${pct}%` }"
      />
    </div>
    <span class="text-xs text-gray-400 w-10 text-right shrink-0">{{ pct }}%</span>
  </div>
</template>
