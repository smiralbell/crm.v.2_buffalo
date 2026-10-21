import { DEFAULT_RULES, DEFAULT_SETTINGS, MODEL_PRESETS } from './defaults'
import * as store from './store'
import type { BlogRules, BlogSettings } from './types'

type Doc<T> = { id: string; value: T; updatedAt: string; history?: { at: string; by?: string; value: T }[] }

function deepMerge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return (over as T) ?? base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k]
    out[k] = b && typeof b === 'object' && !Array.isArray(b) ? deepMerge(b, v) : v
  }
  return out as T
}

export async function getSettings(): Promise<BlogSettings> {
  const doc = await store.get<Doc<BlogSettings>>('settings', 'main')
  const s = deepMerge(DEFAULT_SETTINGS, doc?.value)
  // Configuraciones guardadas antes de existir los modelos económicos: se pasan a ellos
  // (la primera versión usaba Opus para redactar, demasiado caro para un blog).
  if (!doc?.value?.models?.preset) {
    s.models = { ...MODEL_PRESETS.economico.models, preset: 'economico' }
    s.images.openrouterModel = MODEL_PRESETS.economico.image
  }
  return s
}

export async function saveSettings(value: BlogSettings, by?: string): Promise<BlogSettings> {
  await store.put<Doc<BlogSettings>>('settings', { id: 'main', value, updatedAt: new Date().toISOString() })
  void by
  return value
}

function madridToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

/** El plan no puede seguir anclado a noviembre ni a 10/7 días de antelación. */
export async function migrateSettingsIfNeeded() {
  const s = await getSettings()
  const today = madridToday()
  let changed = false
  if (!s.schedule.startDate || s.schedule.startDate > today) {
    s.schedule.startDate = today
    changed = true
  }
  if (s.leadTimes.briefDaysBefore > 3 || s.leadTimes.draftDaysBefore > 3) {
    s.leadTimes = { briefDaysBefore: 2, draftDaysBefore: 2 }
    changed = true
  }
  if (changed) await saveSettings(s, 'sistema')
}

const NO_GAPS_LINE =
  '- Nunca dejes huecos, corchetes ni notas para el equipo. El artículo tiene que poder publicarse tal cual. Si no hay un caso propio que encaje, usa una situación cotidiana genérica (un despacho que pierde llamadas, una inmobiliaria con WhatsApp sin filtrar) sin inventar nombres de cliente ni cifras.'

/** Las reglas guardadas antiguas pedían [SERGI: …]; eso ya no se usa. */
export function sanitizeRules(r: BlogRules): BlogRules {
  let voice = (r.voice || '')
    .replace(/- Donde falte material propio[^\n]*/gi, NO_GAPS_LINE)
    .replace(/\s*\[SERGI:[^\]]*\]/gi, '')
  if (/\[SERGI:/i.test(r.voice) && !/Nunca dejes huecos/i.test(voice)) {
    voice = `${voice.trim()}\n${NO_GAPS_LINE}`
  }
  return { ...r, voice }
}

export async function getRules(): Promise<BlogRules> {
  const doc = await store.get<Doc<BlogRules>>('rules', 'main')
  return sanitizeRules({ ...DEFAULT_RULES, ...(doc?.value || {}) })
}

/** Si las reglas guardadas aún pedían [SERGI: …], las actualiza una sola vez. */
export async function migrateRulesIfNeeded() {
  const doc = await store.get<Doc<BlogRules>>('rules', 'main')
  const raw = doc?.value?.voice || ''
  if (!/\[SERGI:/i.test(raw) && !/Donde falte material propio/i.test(raw)) return
  await saveRules(sanitizeRules({ ...DEFAULT_RULES, ...(doc?.value || {}) }), 'sistema')
}

/** Las reglas guardan historial: si un cambio empeora los artículos, se vuelve atrás. */
export async function saveRules(value: BlogRules, by?: string): Promise<BlogRules> {
  const prev = await store.get<Doc<BlogRules>>('rules', 'main')
  const history = [...(prev?.history || [])]
  if (prev?.value) history.unshift({ at: prev.updatedAt, by, value: prev.value })
  await store.put<Doc<BlogRules>>('rules', {
    id: 'main',
    value,
    updatedAt: new Date().toISOString(),
    history: history.slice(0, 20),
  })
  return value
}

export async function rulesHistory() {
  const doc = await store.get<Doc<BlogRules>>('rules', 'main')
  return (doc?.history || []).map((h) => ({ at: h.at, by: h.by }))
}
