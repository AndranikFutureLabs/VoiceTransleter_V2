<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)

function openLink(url: string) {
  window.electronAPI.openLink(url)
}

defineExpose({ show: () => { open.value = true } })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      @click.self="open = false"
    >
      <div class="bg-gray-800 rounded-2xl border border-gray-700 w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold">О программе</h2>
            <button
              class="text-gray-400 hover:text-white transition-colors"
              @click="open = false"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p class="text-sm text-gray-300 mb-4">
            VoiceTransleter V2 — дубляж видео с переводом речи на русский язык с синтезом голоса
          </p>

          <div class="border-t border-gray-700 my-3" />

          <p class="text-xs text-gray-400 mb-1">Разработчик: Андраник Алавердян (AndranikFutureLabs)</p>

          <div class="space-y-1 text-sm">
            <p>
              <span class="text-gray-400">Поддержка: </span>
              <button class="text-cyan-400 hover:underline" @click="openLink('https://t.me/AndranikFutureLabs')">
                @AndranikFutureLabs
              </button>
            </p>
            <p>
              <span class="text-gray-400">Канал: </span>
              <button class="text-cyan-400 hover:underline" @click="openLink('https://t.me/AndranikFutureLabsChannel')">
                @AndranikFutureLabsChannel
              </button>
            </p>
            <p>
              <span class="text-gray-400">Сайт: </span>
              <button class="text-cyan-400 hover:underline" @click="openLink('https://andranik-future-labs.ru')">
                https://andranik-future-labs.ru
              </button>
            </p>
            <p>
              <span class="text-gray-400">GitHub: </span>
              <button class="text-cyan-400 hover:underline" @click="openLink('https://github.com/AndranikFutureLabs/VoiceTransleter_V2')">
                https://github.com/AndranikFutureLabs/VoiceTransleter_V2
              </button>
            </p>
          </div>

          <div class="border-t border-gray-700 my-3" />

          <div class="text-xs space-y-1 text-gray-400">
            <p>Версия 2.1.7</p>
            <p>Whisper · XTTS v2 · Google Translate</p>
          </div>

          <div class="border-t border-gray-700 my-3" />

          <div class="text-xs space-y-1 text-gray-500">
            <p>© 2024-2026 AndranikFutureLabs. Все права защищены.</p>
            <p>Приложение использует Whisper (распознавание речи) и XTTS v2 (синтез речи с клонированием голоса) — нейросетевые модели для обработки видео. Результаты зависят от качества исходного материала.</p>
          </div>
        </div>

        <div class="px-6 pb-4 flex justify-end">
          <button class="btn-secondary text-sm" @click="open = false">Закрыть</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
