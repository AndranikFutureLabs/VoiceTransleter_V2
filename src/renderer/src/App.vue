<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import VideoDropZone from './components/VideoDropZone.vue'
import LangSelector from './components/LangSelector.vue'
import VoiceSelector from './components/VoiceSelector.vue'
import PipelineLog from './components/PipelineLog.vue'
import ProgressBar from './components/ProgressBar.vue'
import StatusBadge from './components/StatusBadge.vue'
import AboutDialog from './components/AboutDialog.vue'

const videoPath = ref<string | null>(null)
const sourceLang = ref('auto')
const voiceId = ref('silero_xenia')
const isRunning = ref(false)
const isInitializing = ref(false)
const progress = ref(0)
const logVisible = ref(false)
const logRef = ref<InstanceType<typeof PipelineLog>>()
const aboutRef = ref<InstanceType<typeof AboutDialog>>()
const lastOutputDir = ref<string | null>(null)
const status = reactive({
  ffmpeg: false,
  whisper: false,
  whisperCached: false,
  whisperDownloading: false,
  tts: false,
  ttsCached: false,
  ttsDownloading: false,
  python: false,
  pythonVersion: '',
  pythonCompatible: false,
  pythonDeps: false
})
const allReady = ref(false)

let cleanupFns: (() => void)[] = []

onMounted(async () => {
  const api = window.electronAPI

  cleanupFns.push(api.onPipelineLog((msg) => {
    logRef.value?.addEntry(msg)
  }))

  cleanupFns.push(api.onPipelineProgress((pct) => {
    progress.value = pct
  }))

  cleanupFns.push(api.onModelsProgress((pct) => {
    progress.value = pct * 0.5
    if (!allReady.value && !logVisible.value) {
      logVisible.value = true
      logRef.value?.clear()
    }
  }))

  cleanupFns.push(api.onPipelineDone((result) => {
    isRunning.value = false
    isInitializing.value = false
    if (result.success) {
      lastOutputDir.value = result.outputDir || null
      logRef.value?.addEntry('✅ Дубляж завершён!')
      logRef.value?.addEntry('  📁 Текстовые файлы сохранены рядом с видео')
    } else {
      logRef.value?.addEntry(`❌ Ошибка: ${result.error}`)
    }
  }))

  cleanupFns.push(api.onModelsLoaded(async () => {
    const m = await api.checkModels()
    status.whisper = m.whisper
    status.tts = m.tts
    allReady.value = m.whisper && m.tts && m.ffmpeg !== null
    logRef.value?.addEntry('✅ Все модели готовы к работе!')
  }))

  const models = await api.checkModels()
  status.whisper = models.whisper
  status.whisperDownloading = models.whisperDownloading
  status.tts = models.tts
  status.ttsDownloading = models.ttsDownloading
  status.ffmpeg = models.ffmpeg !== null
  status.whisperCached = models.whisperCached
  status.ttsCached = models.ttsCached
  status.python = models.python ?? true
  status.pythonVersion = models.pythonVersion ?? ''
  status.pythonCompatible = models.pythonCompatible ?? true
  status.pythonDeps = models.pythonDeps ?? true
  allReady.value = models.whisper && models.tts && models.ffmpeg !== null
})

async function initModels() {
  if (isInitializing.value) return
  isInitializing.value = true
  progress.value = 0
  logVisible.value = true
  logRef.value?.clear()

  const result = await window.electronAPI.loadModels()
  if (result.success) {
    const models = await window.electronAPI.checkModels()
    status.whisper = models.whisper
    status.tts = models.tts
    allReady.value = true
    logRef.value?.addEntry('✅ Все модели готовы к работе!')
  } else {
    logRef.value?.addEntry(`❌ Ошибка: ${result.error}`)
  }
  isInitializing.value = false
}

function handleFileSelected(path: string) {
  videoPath.value = path
}

async function clearCache() {
  logVisible.value = true
  logRef.value?.clear()
  logRef.value?.addEntry('🧹 Очистка кэша моделей...')
  try {
    await window.electronAPI.clearCache()
    status.whisper = false
    status.tts = false
    allReady.value = false
    logRef.value?.addEntry('✅ Кэш очищен. Перезагрузите модели (кнопка "Загрузить модели")')
  } catch (err: any) {
    logRef.value?.addEntry(`❌ Ошибка очистки кэша: ${err.message}`)
  }
}

async function startPipeline() {
  if (!videoPath.value || isRunning.value) return

  isRunning.value = true
  progress.value = 0
  logVisible.value = true
  logRef.value?.clear()

  window.electronAPI.startPipeline({
    videoPath: videoPath.value,
    sourceLang: sourceLang.value,
    voiceId: voiceId.value,
  })
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 flex flex-col">
    <header class="flex items-center gap-3 px-6 py-3 bg-gray-900 border-b border-gray-800">
      <svg class="w-7 h-7 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
      <h1 class="text-xl font-bold flex-1">VoiceTransleter V2</h1>
      <button
        class="text-gray-400 hover:text-red-400 transition-colors p-1"
        title="Очистить кэш моделей"
        @click="clearCache"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
      <button
        class="text-gray-400 hover:text-white transition-colors p-1"
        title="О программе"
        @click="aboutRef?.show()"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    </header>

    <main class="flex-1 px-6 py-5 max-w-3xl mx-auto w-full">
      <h2 class="text-lg font-bold mb-1">Дубляж видео</h2>
      <p class="text-sm text-gray-400 mb-4">Перевод речи на русский язык с синтезом голоса</p>

      <!-- Python version warning -->
      <div
        v-if="status.python && !status.pythonCompatible"
        class="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-xl text-sm text-red-300"
      >
        ⚠️ <strong>Python {{ status.pythonVersion }} не поддерживается!</strong><br>
        Coqui TTS требует Python 3.9–3.11. Установите <a href="https://www.python.org/downloads/release/python-3119/" class="underline text-red-200" @click.prevent="window.electronAPI.openLink('https://www.python.org/downloads/release/python-3119/')">Python 3.11</a> и попробуйте снова.
      </div>

      <!-- Status badges -->
      <div class="flex flex-wrap gap-4 mb-4 p-3 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <StatusBadge
          :label="status.python ? `Python ${status.pythonVersion}` : 'Python'"
          :ready="status.python && status.pythonCompatible"
        />
        <StatusBadge label="Py-зависимости" :ready="status.pythonDeps" />
        <StatusBadge label="FFmpeg" :ready="status.ffmpeg" />
        <StatusBadge
          label="Whisper"
          :ready="status.whisper"
          :cached="status.whisperCached"
          :downloading="status.whisperDownloading"
        />
        <StatusBadge
          label="TTS"
          :ready="status.tts"
          :cached="status.ttsCached"
          :downloading="status.ttsDownloading"
        />
      </div>

      <VideoDropZone @file-selected="handleFileSelected" />

      <div class="mt-5 flex items-end gap-3 flex-wrap">
        <LangSelector v-model="sourceLang" />
        <VoiceSelector v-model="voiceId" />
      </div>

      <div class="mt-6 flex justify-center gap-3 flex-wrap">
        <button
          v-if="!allReady"
          class="btn-primary !bg-amber-600 hover:!bg-amber-500"
          :disabled="isInitializing"
          @click="initModels"
        >
          <svg v-if="isInitializing" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {{ isInitializing ? 'Загрузка моделей...' : 'Загрузить модели' }}
        </button>

        <button
          v-if="allReady && !isRunning"
          class="btn-primary"
          :disabled="!videoPath"
          @click="startPipeline"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          Начать дубляж
        </button>

        <button
          v-if="isRunning"
          class="btn-primary !bg-gray-600 cursor-wait"
          disabled
        >
          <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Обработка...
        </button>

        <button
          v-if="lastOutputDir"
          class="btn-primary !bg-emerald-600 hover:!bg-emerald-500"
          @click="window.electronAPI.openFolder(lastOutputDir)"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
          </svg>
          Открыть папку с результатами
        </button>
      </div>

      <div class="mt-4 space-y-3">
        <ProgressBar :value="progress" :visible="logVisible" />
        <PipelineLog ref="logRef" :visible="logVisible" />
      </div>
    </main>

    <AboutDialog ref="aboutRef" />
  </div>
</template>
