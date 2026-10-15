/** Modelos OpenRouter para el informe del flujo Sistema. */
export const DEFAULT_WATCH_MODEL = 'qwen/qwen3.7-flash'

export type WatchModelOption = {
  id: string
  label: string
  hint: string
}

export const WATCH_MODELS: WatchModelOption[] = [
  {
    id: 'qwen/qwen3.7-flash',
    label: 'Qwen 3.7 Flash',
    hint: '1M contexto · el más barato',
  },
  {
    id: 'deepseek/deepseek-v4.1-flash',
    label: 'DeepSeek V4.1 Flash',
    hint: '1M contexto · muy barato',
  },
  {
    id: 'google/gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    hint: '1M contexto · barato y estable',
  },
  {
    id: 'anthropic/claude-haiku-5.5',
    label: 'Claude Haiku 5.5',
    hint: '1M contexto · más fino en español',
  },
  {
    id: 'google/gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    hint: '1M contexto · más calidad',
  },
]

export function resolveWatchModel(raw?: string | null): string {
  const s = (raw || '').trim()
  if (!s) return DEFAULT_WATCH_MODEL
  if (WATCH_MODELS.some((m) => m.id === s)) return s
  if (/^[a-z0-9][a-z0-9._~:/-]{2,119}$/i.test(s)) return s
  return DEFAULT_WATCH_MODEL
}

export function watchModelLabel(id: string): string {
  const hit = WATCH_MODELS.find((m) => m.id === id)
  return hit ? hit.label : id
}
