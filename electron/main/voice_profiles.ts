import { existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface VoiceProfile {
  id: string
  name: string
  engine: string
  type: 'custom'
  samplePath?: string
}

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.ogg', '.flac']

function getVoicesDir(): string {
  const userData = app.getPath('userData')
  const dir = join(userData, 'voices')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getProjectVoicesDir(): string {
  const dir = join(app.getAppPath(), 'voices')
  if (existsSync(dir)) return dir
  const devDir = join(__dirname, '../../voices')
  if (existsSync(devDir)) return devDir
  return getVoicesDir()
}

function importProjectVoices(): void {
  const srcDir = getProjectVoicesDir()
  const dstDir = getVoicesDir()
  if (srcDir === dstDir || !existsSync(srcDir)) return
  const { copyFileSync } = require('fs')
  for (const entry of readdirSync(srcDir)) {
    const ext = entry.toLowerCase().slice(entry.lastIndexOf('.'))
    if (!AUDIO_EXTENSIONS.includes(ext)) continue
    const dst = join(dstDir, entry)
    if (!existsSync(dst)) {
      try { copyFileSync(join(srcDir, entry), dst) } catch {}
    }
  }
}

export function getVoiceProfiles(): VoiceProfile[] {
  importProjectVoices()

  const voices: VoiceProfile[] = [
    { id: 'voice_default', name: 'По умолчанию (клон из образца)', engine: 'xtts', type: 'custom' }
  ]
  const seenIds = new Set<string>(['voice_default'])

  const dirs = [getVoicesDir(), getProjectVoicesDir()]

  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const ext = entry.toLowerCase().slice(entry.lastIndexOf('.'))
      if (!AUDIO_EXTENSIONS.includes(ext)) continue
      const name = entry.replace(/\.[^.]+$/, '')
      const id = `voice_${name}`
      if (seenIds.has(id)) continue
      seenIds.add(id)
      voices.push({
        id,
        name,
        engine: 'xtts',
        type: 'custom',
        samplePath: join(dir, entry),
      })
    }
  }

  return voices
}

export function getVoiceById(id: string): VoiceProfile | undefined {
  return getVoiceProfiles().find(v => v.id === id)
}
