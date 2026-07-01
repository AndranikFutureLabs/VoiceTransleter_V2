import translate from 'google-translate-api-x'

const LANG_MAP: Record<string, string> = {
  auto: 'auto',
  en: 'en',
  ru: 'ru',
  de: 'de',
  fr: 'fr',
  es: 'es',
  it: 'it',
  pt: 'pt',
  nl: 'nl',
  pl: 'pl',
  ja: 'ja',
  ko: 'ko',
  zh: 'zh-CN',
  ar: 'ar',
  tr: 'tr',
  hi: 'hi',
  vi: 'vi',
  th: 'th',
  uk: 'uk',
  sv: 'sv',
  da: 'da',
  fi: 'fi',
  cs: 'cs',
  ro: 'ro',
  hu: 'hu',
  el: 'el',
  he: 'iw',
  id: 'id',
  ms: 'ms',
  no: 'no',
  sk: 'sk',
  bg: 'bg',
  sr: 'sr',
  hr: 'hr',
  ca: 'ca',
  lt: 'lt',
  lv: 'lv',
  et: 'et',
  sl: 'sl'
}

let lastTranslateTime = 0

export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  if (!text.trim()) return ''

  const from = LANG_MAP[sourceLang] || 'auto'
  const to = LANG_MAP[targetLang] || 'ru'

  if (from === to && sourceLang !== 'auto') return text

  const now = Date.now()
  const wait = Math.max(0, 350 - (now - lastTranslateTime))
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastTranslateTime = Date.now()

  const result = await translate(text, { from, to, forceBatch: false })
  return result.text
}
