import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { createInterface, type Interface } from 'readline'
import { getVoiceById, getVoiceProfiles } from './voice_profiles'
import { getPythonCommand, PATH_SEPARATOR } from './platform'

let pyProcess: ChildProcess | null = null
let rl: Interface | null = null
let isReady = false
let isDownloading = false
let pendingReady: Array<{ resolve: () => void; reject: (err: Error) => void }> = []
let requestId = 0
const pending = new Map<number, { resolve: (val: any) => void; reject: (err: Error) => void }>()
let logHandler: ((msg: string) => void) | null = null

function getScriptPath(): string {
  const dev = join(__dirname, '../../scripts/tts_server.py')
  const prod = join(process.resourcesPath || '', 'scripts', 'tts_server.py')
  const { existsSync } = require('fs')
  if (existsSync(dev)) return dev
  return prod
}

function getVoicesDir(): string {
  const dir = join(app.getPath('userData'), 'voices')
  const { existsSync, mkdirSync } = require('fs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function isTtsReady(): boolean { return isReady }
export function isTtsDownloading(): boolean { return isDownloading }
export function isTtsCached(): boolean { return true }

export async function loadTtsModel(onProgress?: (pct: number) => void, onLog?: (msg: string) => void): Promise<void> {
  if (isReady) return
  if (isDownloading) {
    return new Promise((resolve, reject) => {
      pendingReady.push({ resolve, reject })
    })
  }
  isDownloading = true
  logHandler = onLog || null

  return new Promise((resolve, reject) => {
    pendingReady.push({ resolve, reject })
    const script = getScriptPath()
    onLog?.('🔄 Запуск XTTS v2 (Python, загрузка ~2.5 ГБ, первый раз может быть долго)...')

    const oldPath = process.env.PATH || ''
    const newPath = `${oldPath}`

    pyProcess = spawn(getPythonCommand(), [script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: newPath, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      shell: true,
    })

    let stderrBuf = ''
    let lastProgressLine = ''

    pyProcess.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrBuf += text
      // tqdm uses \r to update progress in-place; extract the last progress line
      const parts = text.split('\r')
      for (const p of parts) {
        const trimmed = p.trim()
        if (!trimmed) continue
        lastProgressLine = trimmed
        onLog?.(`  ⬇️ ${trimmed.slice(0, 120)}`)
      }
    })

    rl = createInterface({ input: pyProcess!.stdout!, terminal: false })

    rl.on('line', (line: string) => {
      try {
        const msg = JSON.parse(line)
        if (msg.type === 'ready') {
          isReady = true
          isDownloading = false
          onLog?.('✅ XTTS v2 загружен!')
          const cbs = pendingReady.slice()
          pendingReady = []
          for (const cb of cbs) cb.resolve()
        } else if (msg.type === 'log') {
          onLog?.(`  🐍 ${msg.message}`)
        } else if (msg.type === 'error') {
          onLog?.(`⚠️ Ошибка TTS: ${msg.message}`)
          isDownloading = false
          const cbs = pendingReady.slice()
          pendingReady = []
          for (const cb of cbs) cb.reject(new Error(msg.message))
        } else if (msg.type === 'result') {
          const pid = msg.id
          if (pid !== undefined && pending.has(pid)) {
            const cb = pending.get(pid)!
            pending.delete(pid)
            if (msg.status === 'ok') {
              cb.resolve(undefined)
            } else {
              cb.reject(new Error(msg.message || 'Unknown TTS error'))
            }
          }
        }
      } catch { /* ignore parse errors */ }
    })

    pyProcess.on('exit', (code) => {
      isReady = false
      isDownloading = false
      if (code !== 0) {
        const err = new Error(`Python TTS exited with code ${code}\n${stderrBuf.slice(-500)}`)
        const cbs = pendingReady.slice()
        pendingReady = []
        for (const cb of cbs) cb.reject(err)
        for (const [_, p] of pending) p.reject(err)
        pending.clear()
      }
    })

    pyProcess.on('error', (err) => {
      isDownloading = false
      const cbs = pendingReady.slice()
      pendingReady = []
      for (const cb of cbs) cb.reject(new Error(`Failed to start Python TTS: ${err.message}`))
    })

    // reminder every 30s + show last progress line
    const progressTimer = setInterval(() => {
      if (!isReady && isDownloading) {
        const prog = lastProgressLine ? ` (${lastProgressLine.slice(0, 80)})` : ''
        onLog?.(`  ⏳ XTTS загружается...${prog}`)
      }
    }, 30000)

    // timeout 60 min for initial download (~2.5 GB)
    const loadTimeout = setTimeout(() => {
      if (!isReady && isDownloading) {
        clearInterval(progressTimer)
        onLog?.('❌ Таймаут загрузки XTTS (>60 мин)')
        onLog?.(`  stderr: ${stderrBuf.slice(-500)}`)
        isDownloading = false
        const err = new Error('XTTS load timeout (>60 min)')
        const cbs = pendingReady.slice()
        pendingReady = []
        for (const cb of cbs) cb.reject(err)
      }
    }, 3600000)

    // cleanup timers on ready/error
    const origResolve = pendingReady[pendingReady.length - 1]?.resolve
    const origReject = pendingReady[pendingReady.length - 1]?.reject
    if (pendingReady.length > 0) {
      const idx = pendingReady.length - 1
      pendingReady[idx] = {
        resolve: () => { clearInterval(progressTimer); clearTimeout(loadTimeout); origResolve?.() },
        reject: (e) => { clearInterval(progressTimer); clearTimeout(loadTimeout); origReject?.(e) }
      }
    }
  })
}

export async function synthesizeSpeech(text: string, outputPath: string, voiceId: string, onLog?: (msg: string) => void): Promise<void> {
  if (!pyProcess || !rl || !isReady) throw new Error('TTS not loaded')

  const profile = getVoiceById(voiceId)
  let samplePath = profile?.samplePath

  if (!samplePath || voiceId === 'voice_default') {
    const allVoices = getVoiceProfiles()
    const firstReal = allVoices.find(v => v.samplePath && v.id !== 'voice_default')
    if (firstReal) samplePath = firstReal.samplePath
  }

  const voicesDir = getVoicesDir()
  const { existsSync, writeFileSync } = require('fs')

  const defaultWav = join(voicesDir, '_default_silence.wav')
  if (!existsSync(defaultWav)) {
    const sr = 24000
    const dur = 1
    const samples = new Int16Array(sr * dur)
    const header = Buffer.alloc(44)
    header.write('RIFF', 0); header.writeUInt32LE(36 + samples.length * 2, 4)
    header.write('WAVE', 8); header.write('fmt ', 12)
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20)
    header.writeUInt16LE(1, 22); header.writeUInt32LE(sr, 24)
    header.writeUInt32LE(sr * 2, 28); header.writeUInt16LE(2, 32)
    header.writeUInt16LE(16, 34); header.write('data', 36)
    header.writeUInt32LE(samples.length * 2, 40)
    writeFileSync(defaultWav, Buffer.concat([header, Buffer.from(samples.buffer)]))
  }

  const speakerWav = samplePath || defaultWav

  return new Promise((resolve, reject) => {
    const id = ++requestId
    const timers: NodeJS.Timeout[] = []

    pending.set(id, {
      resolve: (v: any) => {
        timers.forEach(clearTimeout)
        resolve(v)
      },
      reject: (e: Error) => {
        timers.forEach(clearTimeout)
        reject(e)
      },
    })

    const req = JSON.stringify({
      type: 'synthesize',
      id,
      text,
      speaker_wav: speakerWav,
      language: 'ru',
      output_path: outputPath,
    })

    pyProcess!.stdin!.write(req + '\n')

    for (let s = 30; s <= 240; s += 30) {
      timers.push(setTimeout(() => {
        if (pending.has(id)) {
          onLog?.(`  ⏳ XTTS синтезирует... (${s}с, текст: ${text.slice(0, 50)}${text.length > 50 ? '...' : ''})`)
        }
      }, s * 1000))
    }

    timers.push(setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        timers.forEach(clearTimeout)
        reject(new Error('Таймаут синтеза XTTS (>300 сек)'))
      }
    }, 300000))
  })
}

export function clearTtsCache(): void {
  const { existsSync, rmSync } = require('fs')
  const { join } = require('path')
  const { homedir } = require('os')
  const paths = [
    join(homedir(), '.cache', 'tts'),
    join(homedir(), '.local', 'share', 'tts'),
    join(process.env.LOCALAPPDATA || '', 'tts'),
    join(homedir(), '.cache', 'huggingface', 'hub', 'models--tts_models--multilingual--multi-dataset--xtts_v2'),
  ]
  for (const p of paths) {
    if (existsSync(p)) {
      try { rmSync(p, { recursive: true, force: true }) } catch {}
    }
  }
}

export function stopTts(): void {
  if (pyProcess && pyProcess.stdin) {
    try {
      pyProcess.stdin.write(JSON.stringify({ type: 'shutdown' }) + '\n')
    } catch { /* ignore */ }
    setTimeout(() => {
      if (pyProcess && !pyProcess.killed) pyProcess.kill()
    }, 5000)
  }
  isReady = false
  isDownloading = false
  rl = null
  pyProcess = null
  pending.clear()
}
