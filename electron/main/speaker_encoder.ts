import { readFileSync, existsSync } from 'fs'

function hashToSeed(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash)
}

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

export function generateEmbedding(seed: number, dim: number = 512): Float32Array {
  const rand = seededRandom(seed)
  const arr = new Float32Array(dim)
  for (let i = 0; i < dim; i++) {
    arr[i] = (rand() * 2 - 1) * 0.15
  }
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0)) + 1e-8
  for (let i = 0; i < dim; i++) arr[i] /= norm
  return arr
}

export function embeddingFromAudio(audioPath: string): Float32Array {
  const name = audioPath.split(/[\\/]/).pop() || 'voice'
  const seed = hashToSeed(name + '_' + (existsSync(audioPath) ? readFileSync(audioPath).length.toString() : '0'))
  return generateEmbedding(seed)
}

export function embeddingFromName(name: string): Float32Array {
  return generateEmbedding(hashToSeed(name))
}

export function getDefaultSpeakerEmbeddings(): Map<string, Float32Array> {
  const map = new Map<string, Float32Array>()
  const builtins = ['silero_xenia', 'silero_baya', 'silero_kseniya', 'silero_natasha', 'silero_aidar']
  for (const id of builtins) {
    map.set(id, embeddingFromName(id))
  }
  return map
}
