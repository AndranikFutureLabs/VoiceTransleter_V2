/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface FileInfo {
  path: string
  name: string
  size: number
}

interface ModelsStatus {
  whisper: boolean
  whisperCached: boolean
  whisperDownloading: boolean
  tts: boolean
  ttsCached: boolean
  ttsDownloading: boolean
  ffmpeg: string | null
  python: boolean
  pythonVersion: string
  pythonCompatible: boolean
  pythonDeps: boolean
}

interface ElectronAPI {
  openVideo: () => Promise<FileInfo | null>
  checkModels: () => Promise<ModelsStatus>
  loadModels: () => Promise<{ success: boolean; error?: string }>
  startPipeline: (payload: { videoPath: string; sourceLang: string; voiceId: string }) => void
  checkFfmpeg: () => Promise<string | null>
  downloadFfmpeg: () => Promise<{ success: boolean; error?: string }>
  openFile: (filePath: string) => void
  openFolder: (folderPath: string) => void
  openLink: (url: string) => void
  getVoices: () => Promise<Array<{ id: string; name: string; engine: string; type: 'builtin' | 'custom'; samplePath?: string }>>
  addVoice: () => Promise<{ name?: string; error?: string } | null>
  getVoicesDir: () => Promise<string>
  onPipelineLog: (callback: (msg: string) => void) => () => void
  onPipelineProgress: (callback: (pct: number) => void) => () => void
  onModelsProgress: (callback: (pct: number) => void) => () => void
  onPipelineDone: (callback: (result: { success: boolean; output?: string; error?: string }) => void) => () => void
}

interface Window {
  electronAPI: ElectronAPI
}
