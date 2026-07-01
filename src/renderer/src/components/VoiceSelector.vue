<script setup lang="ts">
import { ref, onMounted } from 'vue'

const model = defineModel<string>({ default: 'silero_xenia' })

interface VoiceOption {
  id: string
  name: string
  type: string
}

const voices = ref<VoiceOption[]>([])
const loading = ref(false)

async function loadVoices() {
  const apiVoices = await window.electronAPI.getVoices()
  voices.value = apiVoices.map(v => ({
    id: v.id,
    name: v.type === 'custom' ? `🎤 ${v.name}` : v.name,
    type: v.type
  }))
  if (voices.value.length > 0 && !voices.value.find(v => v.id === model.value)) {
    model.value = voices.value[0].id
  }
}

onMounted(loadVoices)

async function addVoice() {
  loading.value = true
  try {
    const result = await window.electronAPI.addVoice()
    if (result?.name) {
      await loadVoices()
      const added = voices.value.find(v => v.name.includes(result.name!))
      if (added) model.value = added.id
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-1.5 flex-1 min-w-[200px]">
    <label class="text-xs text-gray-400 font-medium">Голос дубляжа</label>
    <div class="flex gap-2">
      <select
        v-model="model"
        class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
               text-gray-100 focus:outline-none focus:border-cyan-500
               transition-colors appearance-none cursor-pointer"
      >
        <option v-for="v in voices" :key="v.id" :value="v.id">
          {{ v.name }}
        </option>
      </select>
      <button
        class="btn-secondary !px-3 !py-2 shrink-0"
        :disabled="loading"
        @click="addVoice"
        title="Добавить свой голос"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  </div>
</template>
