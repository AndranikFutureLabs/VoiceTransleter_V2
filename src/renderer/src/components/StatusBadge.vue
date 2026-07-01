<script setup lang="ts">
defineProps<{
  label: string
  ready: boolean
  downloading?: boolean
  cached?: boolean
}>()
</script>

<template>
  <div class="flex items-center gap-1.5 text-xs">
    <span
      class="w-2 h-2 rounded-full shrink-0"
      :class="downloading ? 'bg-amber-400 animate-pulse' : ready ? 'bg-green-400' : 'bg-red-400'"
    />
    <span class="text-gray-400">{{ label }}:</span>
    <span
      :class="downloading ? 'text-amber-300' : ready ? 'text-green-300' : 'text-red-300'"
    >
      {{ downloading ? 'Загрузка...' : ready ? (cached ? 'В кэше' : 'Готов') : 'Не загружен' }}
    </span>
  </div>
</template>
