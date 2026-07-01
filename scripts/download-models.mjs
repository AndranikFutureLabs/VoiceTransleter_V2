#!/usr/bin/env node
import { pipeline } from '@huggingface/transformers'
import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const MODELS = [
  { name: 'Xenova/whisper-medium', type: 'automatic-speech-recognition', label: 'Whisper (1.5 ГБ)' },
  { name: 'Xenova/speecht5_tts', type: 'text-to-speech', label: 'SpeechT5 (500 МБ)' },
]

function isModelCached(name) {
  const cachePath = join(homedir(), '.cache', 'huggingface', 'hub', `models--${name.replace('/', '--')}`)
  if (!existsSync(cachePath)) return false
  try {
    const files = readdirSync(cachePath, { recursive: true })
    return files.some(f => typeof f === 'string' && f.endsWith('.onnx'))
  } catch {
    return false
  }
}

async function main() {
  console.log(`💾 Кэш: ${join(homedir(), '.cache', 'huggingface', 'hub')}\n`)

  for (const model of MODELS) {
    if (isModelCached(model.name)) {
      console.log(`✅ ${model.label} (${model.name}) — уже в кэше\n`)
      continue
    }

    console.log(`📥 Загрузка ${model.label} (${model.name})...`)
    console.log(`  ⏳ Это может занять 10-30 минут...`)

    try {
      await pipeline(model.type, model.name, {
        quantized: true,
        progress_callback: (p) => {
          if (p?.status === 'download' && typeof p?.progress === 'number') {
            const pct = Math.round(p.progress * 100)
            process.stdout.write(`\r  ⬇️ ${pct}%`)
          }
        }
      })
      console.log(`\n  ✅ Готово!\n`)
    } catch (err) {
      console.error(`\n  ❌ Ошибка: ${err.message}`)
      console.error(`  Попробуйте: set HF_ENDPOINT=https://hf-mirror.com && node scripts/download-models.mjs\n`)
    }
  }

  console.log('✨ Все модели загружены!')
}

main().catch(console.error)
