<script setup lang="ts">
const model = defineModel<string>({ default: 'auto' })

const languages: Record<string, string> = {
  auto: 'Автоопределение',
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
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label class="text-xs text-gray-400 font-medium">Язык оригинала</label>
    <select
      v-model="model"
      class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
             text-gray-100 focus:outline-none focus:border-cyan-500
             transition-colors appearance-none cursor-pointer"
    >
      <option v-for="(label, code) in languages" :key="code" :value="code">
        {{ label }}
      </option>
    </select>
  </div>
</template>
