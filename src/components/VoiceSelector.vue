<script setup lang="ts">
import { ref } from 'vue'

const model = defineModel<string>({ default: 'silero_xenia' })

const voices = ref([
  { id: 'silero_xenia', name: 'Ксения (Silero)', engine: 'silero' },
  { id: 'silero_baya', name: 'Бая (Silero)', engine: 'silero' },
  { id: 'silero_kseniya', name: 'Ксения (Silero 16kHz)', engine: 'silero' },
  { id: 'silero_natasha', name: 'Наташа (Silero)', engine: 'silero' },
  { id: 'silero_aidar', name: 'Айдар (Silero)', engine: 'silero' },
])
</script>

<template>
  <div class="flex flex-col gap-1.5 flex-1">
    <label class="text-xs text-gray-400 font-medium">Голос дубляжа</label>
    <select
      v-model="model"
      class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
             text-gray-100 focus:outline-none focus:border-cyan-500
             transition-colors appearance-none cursor-pointer"
    >
      <option v-for="v in voices" :key="v.id" :value="v.id">
        {{ v.name }}
      </option>
    </select>
  </div>
</template>
