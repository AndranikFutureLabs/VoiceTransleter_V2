<script setup lang="ts">
const props = defineProps<{
  outputPath: string | null
}>()

function openVideo() {
  if (window.electronAPI && window.electronAPI.openFile) {
    window.electronAPI.openFile(props.outputPath || '')
  }
}

function openFolder() {
  if (window.electronAPI && window.electronAPI.openFolder) {
    const folder = props.outputPath ? props.outputPath.split(/[\\/]/).slice(0, -1).join('\\') : ''
    window.electronAPI.openFolder(folder)
  }
}
</script>

<template>
  <div
    v-if="outputPath"
    class="p-5 rounded-xl bg-gray-800 border border-gray-700 mt-3"
  >
    <p class="text-lg font-bold text-green-400 mb-1">✅ Готово!</p>
    <p class="text-xs text-gray-400 mb-3">
      Файл: {{ outputPath.split(/[\\/]/).pop() }}
    </p>
    <div class="flex gap-3">
      <button class="btn-primary !py-2 !px-4 !text-xs" @click="openVideo">
        Открыть видео
      </button>
      <button class="btn-secondary !text-xs" @click="openFolder">
        Открыть папку
      </button>
    </div>
  </div>
</template>
