import { DEFAULT_RULES, DEFAULT_SETTINGS } from './defaults'
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
  return deepMerge(DEFAULT_SETTINGS, doc?.value)
}

export async function saveSettings(value: BlogSettings, by?: string): Promise<BlogSettings> {
  await store.put<Doc<BlogSettings>>('settings', { id: 'main', value, updatedAt: new Date().toISOString() })
  void by
  return value
}

export async function getRules(): Promise<BlogRules> {
  const doc = await store.get<Doc<BlogRules>>('rules', 'main')
  return { ...DEFAULT_RULES, ...(doc?.value || {}) }
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
