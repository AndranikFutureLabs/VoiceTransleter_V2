import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { app } from 'electron'
import { loadWhisperModel, runWhisper, isWhisperReady } from './whisper'
import { loadTtsModel, synthesizeSpeech, isTtsReady } from './tts'
import { translateText } from './translator'
import { getFfmpegPathSafe, runFfmpeg, getVideoDuration } from './ffmpeg'
import { ensurePythonDeps, checkPythonDeps } from './python_deps'

export interface Segment {
  start: number
  end: number
  text: string
  translated?: string
  audioPath?: string
}

const EN_TO_RU: Record<string, string> = {
  sh: 'ш', ch: 'ч', th: 'з', ph: 'ф', gh: 'г', ng: 'нг',
  tion: 'шн', ight: 'айт', ea: 'иа', ou: 'ау', oo: 'у',
  a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г',
  h: 'х', i: 'и', j: 'дж', k: 'к', l: 'л', m: 'м', n: 'н',
  o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т', u: 'у',
  v: 'в', w: 'в', x: 'кс', y: 'й', z: 'з'
}

function transliterateEnToRu(text: string): string {
  const lower = text.toLowerCase()
  let result = ''
  let i = 0
  while (i < lower.length) {
    let found = false
    for (let len = 4; len >= 1; len--) {
      const sub = lower.slice(i, i + len)
      if (EN_TO_RU[sub]) {
        result += EN_TO_RU[sub]
        i += len
        found = true
        break
      }
    }
    if (!found) { result += lower[i]; i++ }
  }
  return result
}

function transliterateRuToLa(text: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo',
    ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
    н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
    ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
    А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo',
    Ж: 'Zh', З: 'Z', И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M',
    Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U',
    Ф: 'F', Х: 'Kh', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Shch',
    Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya'
  }
  return text.split('').map(c => map[c] || c).join('')
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(7, '0').replace('.', ',')}`
}

function segmentsToSRt(segments: Segment[], textKey: 'text' | 'translated'): string {
  return segments.map(seg =>
    `${formatTimestamp(seg.start)} --> ${formatTimestamp(seg.end)}\n${seg[textKey] || ''}`
  ).join('\n\n') + '\n'
}

function segmentsToPlain(segments: Segment[], textKey: 'text' | 'translated'): string {
  return segments.map(seg => seg[textKey] || '').join('\n')
}

function saveTextFiles(
  segments: Segment[],
  detectedLang: string,
  videoName: string,
  outputDir: string
): void {
  const base = join(outputDir, videoName)

  writeFileSync(base + '_source.txt', segmentsToSRt(segments, 'text'), 'utf8')
  writeFileSync(base + '_source_plain.txt', segmentsToPlain(segments, 'text'), 'utf8')
  writeFileSync(base + '_translation.txt', segmentsToSRt(segments, 'translated'), 'utf8')
  writeFileSync(base + '_translation_plain.txt', segmentsToPlain(segments, 'translated'), 'utf8')

  const translitSource = segments.map(seg => {
    const t = detectedLang === 'ru' ? transliterateRuToLa(seg.text) : transliterateEnToRu(seg.text)
    return { ...seg, text: t }
  })
  writeFileSync(base + '_source_translit.txt', segmentsToSRt(translitSource, 'text'), 'utf8')
  writeFileSync(base + '_source_translit_plain.txt', segmentsToPlain(translitSource, 'text'), 'utf8')

  const translitTranslation = segments.map(seg => {
    const t = transliterateRuToLa(seg.translated || '')
    return { ...seg, translated: t }
  })
  writeFileSync(base + '_translation_translit.txt', segmentsToSRt(translitTranslation, 'translated'), 'utf8')
  writeFileSync(base + '_translation_translit_plain.txt', segmentsToPlain(translitTranslation, 'translated'), 'utf8')
}

const LANG_NAMES: Record<string, string> = {
  en: 'Английский', es: 'Испанский', fr: 'Французский',
  de: 'Немецкий', it: 'Итальянский', pt: 'Португальский',
  nl: 'Нидерландский', pl: 'Польский', ru: 'Русский',
  zh: 'Китайский', ja: 'Японский', ko: 'Корейский',
  ar: 'Арабский', tr: 'Турецкий', hi: 'Хинди',
  vi: 'Вьетнамский', th: 'Тайский', uk: 'Украинский',
  sv: 'Шведский', da: 'Датский', fi: 'Финский',
  cs: 'Чешский', ro: 'Румынский', hu: 'Венгерский',
  el: 'Греческий', he: 'Иврит', id: 'Индонезийский'
}

function getTempDir(clean = false) {
  const dir = join(app.getPath('userData'), 'temp')
  if (clean && existsSync(dir)) {
    const { rmSync } = require('fs')
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getOutputDir() {
  const dir = join(app.getPath('userData'), 'output')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export async function ensureModels(
  onLog: (msg: string) => void,
  onProgress: (pct: number) => void
): Promise<void> {
  onLog('🔍 Проверка зависимостей...')

  // Check and install Python dependencies first
  await ensurePythonDeps(onLog, onProgress)

  if (!getFfmpegPathSafe()) {
    throw new Error('FFmpeg не найден. Нажмите "Загрузить FFmpeg" перед запуском.')
  }

  if (!isWhisperReady()) {
    await loadWhisperModel(onProgress, onLog)
  }

  if (!isTtsReady()) {
    await loadTtsModel(onProgress, onLog)
  }

  onLog('✅ Все модели загружены, запуск пайплайна...')
}

export async function runDubbingPipeline(
  videoPath: string,
  sourceLang: string,
  voiceId: string,
  onLog: (msg: string) => void,
  onProgress: (pct: number) => void
): Promise<string> {
  const tempDir = getTempDir(true)
  const outputDir = getOutputDir()
  const videoName = videoPath.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')
  const outputPath = join(outputDir, `${videoName}_dubbed.mp4`)

  onLog('[1/5] Извлечение аудио из видео...')
  onProgress(0.05)
  const audioPath = join(tempDir, 'extracted_audio.wav')
  await runFfmpeg([
    '-y', '-i', videoPath,
    '-vn', '-acodec', 'pcm_s16le',
    '-ar', '16000', '-ac', '1',
    audioPath
  ])
  onLog('  ✅ Аудио извлечено')
  onProgress(0.15)

  onLog('[2/5] Распознавание речи...')
  onProgress(0.2)
  const { segments, detectedLang } = await runWhisper(audioPath, sourceLang, onLog)
  const langLabel = LANG_NAMES[detectedLang] || detectedLang.toUpperCase()
  onLog(`  🌐 Определён язык: ${langLabel} (${detectedLang})`)
  onLog(`  📊 Найдено сегментов: ${segments.length}`)
  onProgress(0.4)

  const isRevoice = detectedLang === 'ru'
  onLog(`[3/5] ${isRevoice ? 'Режим ревойса (язык уже русский)' : 'Перевод на русский...'}`)
  onProgress(0.45)

  const translated: Segment[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    let translatedText: string
    if (isRevoice) {
      translatedText = seg.text
    } else {
      translatedText = await translateText(seg.text, detectedLang, 'ru')
    }
    translated.push({ ...seg, translated: translatedText })
    if ((i + 1) % 5 === 0 || i === segments.length - 1) {
      onLog(`  📝 Переведено ${i + 1}/${segments.length} сегментов`)
    }
  }
  onProgress(0.6)

  onLog(`[4/5] Синтез речи (XTTS, ~10-15 сек на сегмент)...`)
  onProgress(0.65)
  const ttsSegments: Segment[] = []
  const synthStart = Date.now()
  for (let i = 0; i < translated.length; i++) {
    const seg = translated[i]
    const segPath = join(tempDir, `seg_${seg.start.toFixed(2)}.wav`)
    const txtLen = seg.translated!.length
    onLog(`  🔊 [${i + 1}/${translated.length}] Синтез ${txtLen} символов... (${seg.translated!.slice(0, 60)}${txtLen > 60 ? '...' : ''})`)
    await synthesizeSpeech(seg.translated!, segPath, voiceId, onLog)
    ttsSegments.push({ ...seg, audioPath: segPath })
    const elapsed = Math.round((Date.now() - synthStart) / 1000)
    onLog(`  ✅ [${i + 1}/${translated.length}] Готово (прошло ${elapsed}с)`)
    onProgress(0.65 + ((i + 1) / translated.length) * 0.15)
  }
  onProgress(0.8)

  onLog('[5/5] Сборка финального видео...')
  onProgress(0.85)
  const mergedAudio = join(tempDir, 'merged.wav')
  await mergeAudioSegments(ttsSegments, mergedAudio)
  onLog('  🎵 Дорожки объединены')
  onProgress(0.88)

  const stretchedAudio = join(tempDir, 'stretched.wav')
  const videoDur = getVideoDuration(videoPath)
  const audioDur = parseWavDuration(mergedAudio)
  const ratio = audioDur / videoDur
  onLog(`  ⏱ Видео ${videoDur.toFixed(1)}с, аудио ${audioDur.toFixed(1)}с, ratio ${ratio.toFixed(3)}x`)
  await stretchAudio(mergedAudio, stretchedAudio, ratio, onLog)
  onLog('  🎵 Длительность подогнана')
  onProgress(0.95)

  await replaceAudioInVideo(videoPath, stretchedAudio, outputPath)
  onLog('  🎬 Видео собрано')
  onProgress(1.0)

  onLog('  💾 Сохранение текстовых файлов...')
  saveTextFiles(translated, detectedLang, videoName, outputDir)
  onLog('✅ Готово! Файл сохранён: ' + outputPath)
  return outputPath
}

async function mergeAudioSegments(segments: Segment[], outputPath: string): Promise<void> {
  const OUTPUT_RATE = 48000
  const bytesPerSample = 2
  const channels = 1

  const chunks: Int16Array[] = []

  for (const seg of segments) {
    const buf = readFileSync(seg.audioPath!)
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const sampleRate = view.getUint32(24, true)
    const bitsPerSample = view.getUint16(34, true)

    let dataOffset = 12
    let dataSize = 0
    while (dataOffset + 8 <= buf.length) {
      const id = String.fromCharCode(view.getUint8(dataOffset), view.getUint8(dataOffset + 1), view.getUint8(dataOffset + 2), view.getUint8(dataOffset + 3))
      const sz = view.getUint32(dataOffset + 4, true)
      if (id === 'data') { dataOffset += 8; dataSize = sz; break }
      dataOffset += 8 + sz + (sz % 2)
    }

    const srcCount = dataSize / (bitsPerSample / 8)
    const src = new Int16Array(srcCount)
    for (let i = 0; i < srcCount; i++) src[i] = view.getInt16(dataOffset + i * 2, true)

    if (sampleRate !== OUTPUT_RATE) {
      const dstCount = Math.round(srcCount * OUTPUT_RATE / sampleRate)
      const samples = new Int16Array(dstCount)
      for (let i = 0; i < dstCount; i++) {
        samples[i] = src[Math.min(Math.round(i * sampleRate / OUTPUT_RATE), srcCount - 1)]
      }
      chunks.push(samples)
    } else {
      chunks.push(src)
    }
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0)
  const mixBuf = new Int16Array(totalLen)
  let pos = 0
  for (const c of chunks) { mixBuf.set(c, pos); pos += c.length }

  let rms = 0
  for (let i = 0; i < mixBuf.length; i++) rms += (mixBuf[i] / 32768) * (mixBuf[i] / 32768)
  rms = Math.sqrt(rms / mixBuf.length)
  const gain = rms > 0.001 ? Math.min(0.15 / rms, 4.0) : 1.0

  const wavSize = 44 + mixBuf.length * bytesPerSample
  const wav = Buffer.alloc(wavSize)
  wav.write('RIFF', 0); wav.writeUInt32LE(wavSize - 8, 4)
  wav.write('WAVE', 8); wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(channels, 22); wav.writeUInt32LE(OUTPUT_RATE, 24)
  wav.writeUInt32LE(OUTPUT_RATE * channels * bytesPerSample, 28)
  wav.writeUInt16LE(channels * bytesPerSample, 32)
  wav.writeUInt16LE(bytesPerSample * 8, 34)
  wav.write('data', 36); wav.writeUInt32LE(mixBuf.length * bytesPerSample, 40)

  for (let i = 0; i < mixBuf.length; i++) {
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mixBuf[i] * gain))), 44 + i * 2)
  }

  writeFileSync(outputPath, wav)
}

function parseWavDuration(wavPath: string): number {
  const buf = readFileSync(wavPath)
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const sampleRate = view.getUint32(24, true)
  let dataSize = 0
  let offset = 12
  while (offset + 8 <= buf.length) {
    const id = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))
    const sz = view.getUint32(offset + 4, true)
    if (id === 'data') { dataSize = sz; break }
    offset += 8 + sz + (sz % 2)
  }
  return dataSize / 2 / sampleRate
}

async function stretchAudio(inputPath: string, outputPath: string, ratio: number, onLog?: (msg: string) => void): Promise<void> {
  const ffmpegPath = getFfmpegPathSafe()
  if (!ffmpegPath) throw new Error('FFmpeg not found')

  const clamped = Math.max(0.5, Math.min(2.0, ratio))
  if (Math.abs(clamped - 1.0) < 0.02) {
    const { copyFileSync } = require('fs')
    copyFileSync(inputPath, outputPath)
    return
  }

  const filters: string[] = []
  let r = clamped
  while (r > 2.0) { filters.push('atempo=2.0'); r /= 2.0 }
  while (r < 0.5) { filters.push('atempo=0.5'); r /= 0.5 }
  filters.push(`atempo=${r.toFixed(4)}`)

  await runFfmpeg([
    '-y', '-i', inputPath,
    '-af', filters.join(','),
    '-acodec', 'pcm_s16le',
    '-ar', '48000',
    '-ac', '1',
    outputPath,
  ])

  if (ratio !== clamped) {
    const buf = readFileSync(outputPath)
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const sampleRate = view.getUint32(24, true)
    let dataSize = 0
    let offset = 12
    while (offset + 8 <= buf.length) {
      const id = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))
      const sz = view.getUint32(offset + 4, true)
      if (id === 'data') { dataSize = sz; break }
      offset += 8 + sz + (sz % 2)
    }
    const actualDur = dataSize / 2 / sampleRate
    onLog?.(`  ⚠️ Ratio ${ratio.toFixed(3)}x обрезан до ${clamped.toFixed(3)}x (аудио ${actualDur.toFixed(1)}с вместо ${(parseWavDuration(inputPath) / ratio).toFixed(1)}с)`)
  }
}

async function replaceAudioInVideo(
  videoPath: string,
  newAudioPath: string,
  outputPath: string
): Promise<void> {
  await runFfmpeg([
    '-y', '-i', videoPath,
    '-i', newAudioPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-async', '1',
    outputPath
  ])
}
