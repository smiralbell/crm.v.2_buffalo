/**
 * Cliente de IA del módulo Blog. Propio del módulo para no depender de
 * lib/openrouter.ts (que usan las demos).
 *
 * - Texto: OpenRouter (Claude por defecto). Con `web: true` activa la
 *   búsqueda web de OpenRouter, que devuelve las fuentes citadas.
 * - Imágenes: OpenAI (gpt-image-1) u OpenRouter (modelo de imagen),
 *   según Blog → Configuración.
 *
 * Claves en el entorno: OPENROUTER_API_KEY y, para imágenes con OpenAI,
 * OPENAI_API_KEY.
 */

export interface AiResult<T> {
  data: T
  text: string
  citations: { url: string; title: string; content?: string }[]
  usd: number
}

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions'

function orHeaders() {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('Falta OPENROUTER_API_KEY en el entorno')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.APP_BASE_URL || 'https://buffaloia.com',
    'X-OpenRouter-Title': 'Buffalo CRM - Blog',
  }
}

/** Saca el primer objeto JSON de una respuesta, aunque venga con texto alrededor. */
export function parseJson<T>(text: string): T {
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(clean) as T
  } catch {
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1)) as T
    throw new Error('La IA no devolvió un JSON válido')
  }
}

export async function askAi<T = unknown>(opts: {
  model: string
  system: string
  prompt: string
  json?: boolean
  web?: number // nº de resultados de búsqueda web (0 = sin búsqueda)
  maxTokens?: number
  temperature?: number
}): Promise<AiResult<T>> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.prompt },
    ],
    max_tokens: opts.maxTokens ?? 8000,
    usage: { include: true },
  }
  if (opts.temperature !== undefined) body.temperature = opts.temperature
  if (opts.json) body.response_format = { type: 'json_object' }
  if (opts.web) body.plugins = [{ id: 'web', max_results: opts.web }]

  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(OR_URL, { method: 'POST', headers: orHeaders(), body: JSON.stringify(body) })
    if (res.status === 429 || res.status >= 500) {
      lastErr = `OpenRouter ${res.status}`
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
      continue
    }
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 400)}`)
    const out = await res.json()
    const msg = out.choices?.[0]?.message || {}
    const text: string = typeof msg.content === 'string' ? msg.content : ''
    const citations = (msg.annotations || [])
      .filter((a: { type: string }) => a.type === 'url_citation')
      .map((a: { url_citation: { url: string; title?: string; content?: string } }) => ({
        url: a.url_citation.url,
        title: a.url_citation.title || a.url_citation.url,
        content: a.url_citation.content,
      }))
    const usd = Number(out.usage?.cost || 0)
    const data = opts.json ? parseJson<T>(text) : (text as unknown as T)
    return { data, text, citations, usd }
  }
  throw new Error(lastErr || 'OpenRouter no responde')
}

/* ---------------- Imágenes ---------------- */

export async function generateImage(opts: {
  provider: 'openai' | 'openrouter' | 'ninguno'
  prompt: string
  openaiModel: string
  openrouterModel: string
  size: string
}): Promise<{ dataUrl: string; usd: number } | null> {
  if (opts.provider === 'ninguno') return null

  if (opts.provider === 'openai') {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error('Falta OPENAI_API_KEY en el entorno')
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: opts.openaiModel, prompt: opts.prompt, size: opts.size, quality: 'medium', n: 1 }),
    })
    if (!res.ok) throw new Error(`OpenAI imágenes ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const out = await res.json()
    const b64 = out.data?.[0]?.b64_json
    if (!b64) throw new Error('OpenAI no devolvió imagen')
    return { dataUrl: `data:image/png;base64,${b64}`, usd: 0.06 }
  }

  // OpenRouter: modelos de imagen por chat completions con modalities
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: orHeaders(),
    body: JSON.stringify({
      model: opts.openrouterModel,
      messages: [{ role: 'user', content: opts.prompt + '\n\nFormato horizontal 3:2.' }],
      modalities: ['image', 'text'],
      usage: { include: true },
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter imágenes ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const out = await res.json()
  const url: string | undefined = out.choices?.[0]?.message?.images?.[0]?.image_url?.url
  if (!url) throw new Error('El modelo de imagen de OpenRouter no devolvió imagen')
  return { dataUrl: url, usd: Number(out.usage?.cost || 0) }
}
