import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { createInterface, type Interface } from 'readline'
import { getPythonCommand } from './platform'

let pyProcess: ChildProcess | null = null
let rl: Interface | null = null
let isReady = false
let isDownloading = false
let pendingReady: Array<{ resolve: () => void; reject: (err: Error) => void }> = []
let requestId = 0
const pending = new Map<number, { resolve: (val: any) => void; reject: (err: Error) => void }>()

function getScriptPath(): string {
  const dev = join(__dirname, '../../scripts/whisper_server.py')
  const prod = join(process.resourcesPath || '', 'scripts', 'whisper_server.py')
  const { existsSync } = require('fs')
  if (existsSync(dev)) return dev
  return prod
}

export function isWhisperReady(): boolean { return isReady }
export function isWhisperDownloading(): boolean { return isDownloading }

export function isWhisperCached(): boolean {
  const { existsSync } = require('fs')
  const { homedir } = require('os')
  return existsSync(join(homedir(), '.cache', 'faster-whisper', 'medium'))
}

export function isWhisperCacheValid(): boolean { return isWhisperCached() }

export function clearWhisperCache(): void {
  killProcess()
  const { existsSync, rmSync } = require('fs')
  const { homedir } = require('os')
  for (const p of [
    join(homedir(), '.cache', 'faster-whisper'),
    join(homedir(), '.cache', 'huggingface', 'hub', 'models--Xenova--whisper-medium'),
    join(app.getPath('userData'), 'hf-cache'),
    join(app.getPath('userData'), 'hf-cache'),
  ]) {
    if (existsSync(p)) { try { rmSync(p, { recursive: true, force: true }) } catch {} }
  }
  isReady = false
}

export function getWhisperCachePath(): string {
  const { homedir } = require('os')
  return join(homedir(), '.cache', 'faster-whisper', 'medium')
}

function killProcess(): void {
  if (pyProcess && pyProcess.stdin) {
    try { pyProcess.stdin.write(JSON.stringify({ type: 'shutdown' }) + '\n') } catch {}
    setTimeout(() => { if (pyProcess && !pyProcess.killed) pyProcess.kill() }, 3000)
  }
  isReady = false
  isDownloading = false
  rl = null
  pyProcess = null
  pending.clear()
}

export async function loadWhisperModel(
  onProgress?: (pct: number) => void,
  onLog?: (msg: string) => void
): Promise<void> {
  if (isReady) return
  if (isDownloading) {
    return new Promise((resolve, reject) => { pendingReady.push({ resolve, reject }) })
  }
  isDownloading = true

  return new Promise((resolve, reject) => {
    pendingReady.push({ resolve, reject })
    const script = getScriptPath()
    onLog?.('🔄 Запуск faster-whisper (Python sidecar)...')

    pyProcess = spawn(getPythonCommand(), [script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      shell: true,
    })

    let stderrBuf = ''

    pyProcess.stderr?.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString() })

    rl = createInterface({ input: pyProcess!.stdout!, terminal: false })

    rl.on('line', (line: string) => {
      try {
        const msg = JSON.parse(line)
        if (msg.type === 'ready') {
          isReady = true
          isDownloading = false
          onLog?.('✅ faster-whisper загружен!')
          const cbs = pendingReady.slice(); pendingReady = []
          for (const cb of cbs) cb.resolve()
        } else if (msg.type === 'log') {
          onLog?.(`  🐍 ${msg.message}`)
        } else if (msg.type === 'error') {
          onLog?.(`⚠️ Ошибка Whisper: ${(msg.message || '').slice(0, 200)}`)
          killProcess()
          const cbs = pendingReady.slice(); pendingReady = []
          for (const cb of cbs) cb.reject(new Error(msg.message))
        } else if (msg.type === 'result') {
          const pid = msg.id
          if (pid !== undefined && pending.has(pid)) {
            const cb = pending.get(pid)!; pending.delete(pid)
            msg.status === 'ok' ? cb.resolve(msg) : cb.reject(new Error(msg.message || 'Unknown Whisper error'))
          }
        }
      } catch {}
    })

    pyProcess.on('exit', (code) => {
      isReady = false; isDownloading = false
      if (code !== 0) {
        const err = new Error(`Python Whisper exited with code ${code}\n${stderrBuf.slice(-500)}`)
        const cbs = pendingReady.slice(); pendingReady = []
        for (const cb of cbs) cb.reject(err)
        for (const [_, p] of pending) p.reject(err)
        pending.clear()
      }
    })

    pyProcess.on('error', (err) => {
      isDownloading = false
      const cbs = pendingReady.slice(); pendingReady = []
      for (const cb of cbs) cb.reject(new Error(`Failed to start Python Whisper: ${err.message}`))
    })

    const progressTimer = setInterval(() => {
      if (!isReady && isDownloading) onLog?.('  ⏳ faster-whisper загружается...')
    }, 30000)

    const loadTimeout = setTimeout(() => {
      if (!isReady && isDownloading) {
        clearInterval(progressTimer)
        onLog?.('❌ Таймаут загрузки faster-whisper (>10 мин)')
        onLog?.(`  stderr: ${stderrBuf.slice(-500)}`)
        killProcess()
        const err = new Error('Whisper load timeout (>10 min)')
        const cbs = pendingReady.slice(); pendingReady = []
        for (const cb of cbs) cb.reject(err)
      }
    }, 600000)

    if (pendingReady.length > 0) {
      const i = pendingReady.length - 1
      const origResolve = pendingReady[i].resolve
      const origReject = pendingReady[i].reject
      pendingReady[i] = {
        resolve: () => { clearInterval(progressTimer); clearTimeout(loadTimeout); origResolve() },
        reject: (e) => { clearInterval(progressTimer); clearTimeout(loadTimeout); origReject(e) },
      }
    }
  })
}

export interface WhisperSegment { start: number; end: number; text: string }
export interface WhisperResult { segments: WhisperSegment[]; detectedLang: string }

export async function runWhisper(audioPath: string, language: string, onLog?: (msg: string) => void): Promise<WhisperResult> {
  if (!pyProcess || !rl || !isReady) throw new Error('Whisper not loaded')

  const msg: any = await new Promise((resolve, reject) => {
    const id = ++requestId
    pending.set(id, { resolve, reject })
    pyProcess!.stdin!.write(JSON.stringify({ type: 'transcribe', id, audio_path: audioPath, language }) + '\n')
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('Таймаут распознавания (>10 мин)')) }
    }, 600000)
  })

  onLog?.(`  ✅ Распознано ${msg.segments.length} сегментов, язык: ${msg.detected_language || language || 'en'}`)
  return {
    segments: msg.segments as WhisperSegment[],
    detectedLang: (msg.detected_language || language || 'en') as string,
  }
}
