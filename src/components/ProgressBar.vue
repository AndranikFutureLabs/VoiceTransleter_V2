<script setup lang="ts">
const props = defineProps<{
  value: number
  visible: boolean
}>()
</script>

<template>
  <div v-show="visible" class="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
    <div
      class="h-full bg-cyan-400 rounded-full transition-all duration-300 ease-out"
      :style="{ width: `${Math.round(value * 100)}%` }"
    />
  </div>
</template>
