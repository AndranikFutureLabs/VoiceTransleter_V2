<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'file-selected', path: string): void
}>()

const selectedFile = ref<{ name: string; size: string } | null>(null)
const isActive = ref(false)

async function handleClick() {
  const path = await window.electronAPI.openVideo()
  if (path) {
    const name = path.split(/[\\/]/).pop()!
    const fs = await import('fs')
    const stats = fs.statSync(path)
    const sizeStr = stats.size > 1048576
      ? `${(stats.size / 1048576).toFixed(1)} MB`
      : `${(stats.size / 1024).toFixed(0)} KB`
    selectedFile.value = { name, size: sizeStr }
    isActive.value = true
    emit('file-selected', path)
  }
}
</script>

<template>
  <div
    class="drop-zone"
    :class="{ 'drop-zone-active': isActive }"
    @click="handleClick"
    role="button"
    tabindex="0"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <svg
      v-if="!isActive"
      class="w-12 h-12 text-cyan-300 mb-2"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>

    <template v-if="!isActive">
      <p class="text-base mb-1">Нажмите для выбора видеофайла</p>
      <p class="text-xs text-gray-400">MP4, AVI, MKV, MOV, WebM</p>
    </template>

    <template v-else>
      <svg class="w-8 h-8 text-green-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <p class="text-sm text-green-400 font-medium">{{ selectedFile?.name }}</p>
      <p class="text-xs text-gray-400">{{ selectedFile?.size }}</p>
    </template>
  </div>
</template>
