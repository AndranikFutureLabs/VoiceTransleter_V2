import { execSync, execFileSync, spawnSync } from 'child_process'
import { existsSync, mkdirSync, createWriteStream } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { pipeline } from 'stream'
import { promisify } from 'util'

const streamPipeline = promisify(pipeline)

let ffmpegPath: string | null = null
let ffprobePath: string | null = null

function getResourcesDir(): string {
  const dev = join(__dirname, '../../resources')
  if (existsSync(dev)) return dev
  return process.resourcesPath || ''
}

function getFfmpegDir() {
  const dir = join(app.getPath('userData'), 'ffmpeg-bin')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function findBinary(name: string): string {
  const isWin = process.platform === 'win32'
  const binName = isWin ? `${name}.exe` : name

  const resourcesPath = join(getResourcesDir(), binName)
  if (existsSync(resourcesPath)) return resourcesPath

  const localPath = join(getFfmpegDir(), binName)
  if (existsSync(localPath)) return localPath

  try {
    const cmd = isWin ? `where ${name}` : `which ${name}`
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 })
    return result.trim().split('\n')[0]
  } catch {}

  throw new Error(`${name} не найден. Поместите ${binName} в папку resources/ проекта.`)
}

function getFfmpegPath(): string {
  if (ffmpegPath) return ffmpegPath
  ffmpegPath = findBinary('ffmpeg')
  return ffmpegPath
}

function getFfprobePath(): string {
  if (ffprobePath) return ffprobePath
  ffprobePath = findBinary('ffprobe')
  return ffprobePath
}

export async function downloadFfmpeg(progressCb?: (msg: string) => void): Promise<void> {
  const dir = getFfmpegDir()
  const isWin = process.platform === 'win32'
  const binaryName = isWin ? 'ffmpeg.exe' : 'ffmpeg'
  const dest = join(dir, binaryName)

  if (existsSync(dest)) return

  const platform = isWin ? 'windows' : process.platform
  const arch = process.arch === 'x64' ? '64' : 'arm64'
  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/${platform}-${arch}.gz`

  progressCb?.(`Загрузка FFmpeg (${platform}-${arch})...`)

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download FFmpeg: ${response.status}`)

  const gunzip = (await import('zlib')).createGunzip()
  const fileStream = createWriteStream(dest)

  await streamPipeline(response.body!, gunzip, fileStream)

  if (!isWin) {
    execSync(`chmod +x "${dest}"`)
  }

  ffmpegPath = dest
  progressCb?.('FFmpeg загружен!')
}

export function getFfmpegPathSafe(): string | null {
  try {
    return getFfmpegPath()
  } catch {
    return null
  }
}

export async function runFfmpeg(args: string[]): Promise<void> {
  const fp = getFfmpegPath()
  execFileSync(fp, args, { stdio: 'pipe', timeout: 600000 })
}

export function getVideoDuration(videoPath: string): number {
  const fp = getFfprobePath()
  const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath]
  const result = execFileSync(fp, args, { encoding: 'utf-8', timeout: 30000 }).trim()
  return parseFloat(result)
}
