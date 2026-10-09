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
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  const candidates = [clean, start >= 0 && end > start ? clean.slice(start, end + 1) : '']
  for (const c of candidates) {
    if (!c) continue
    try {
      return JSON.parse(c) as T
    } catch {
      // Arreglos habituales: comas finales y marcas de cita de la búsqueda web pegadas tras una cadena ("texto"[1])
      try {
        return JSON.parse(c.replace(/,\s*([}\]])/g, '$1').replace(/"\s*\[\d+\](?=\s*[,}\]])/g, '"')) as T
      } catch {
        /* sigue */
      }
    }
  }
  throw new Error('JSON_INVALIDO')
}

/** Si la IA devuelve un JSON mal formado, se le pide que lo corrija (llamada barata, sin búsqueda). */
async function repairJson<T>(model: string, broken: string): Promise<{ data: T; usd: number }> {
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: orHeaders(),
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      response_format: { type: 'json_object' },
      usage: { include: true },
      messages: [
        { role: 'system', content: 'Corriges JSON. Devuelve exactamente el mismo contenido como JSON válido, sin texto alrededor, sin cambiar los valores.' },
        { role: 'user', content: broken },
      ],
    }),
  })
  if (!res.ok) throw new Error('La IA devolvió una respuesta mal formada y no se pudo corregir')
  const out = await res.json()
  const text = out.choices?.[0]?.message?.content || ''
  try {
    return { data: parseJson<T>(text), usd: Number(out.usage?.cost || 0) }
  } catch {
    throw new Error('La IA devolvió una respuesta mal formada dos veces. Vuelve a intentarlo.')
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
    if (res.status === 402) throw new Error('Sin saldo en OpenRouter. Recarga créditos en openrouter.ai/settings/credits y vuelve a intentarlo.')
    if (res.status === 401) throw new Error('La clave de OpenRouter (OPENROUTER_API_KEY) no es válida.')
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
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
    let usd = Number(out.usage?.cost || 0)
    if (!text.trim()) {
      lastErr = 'La IA devolvió una respuesta vacía'
      continue
    }
    if (!opts.json) return { data: text as unknown as T, text, citations, usd }
    try {
      return { data: parseJson<T>(text), text, citations, usd }
    } catch {
      const fixed = await repairJson<T>(opts.model, text)
      usd += fixed.usd
      return { data: fixed.data, text, citations, usd }
    }
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
      messages: [{ role: 'user', content: opts.prompt + '\n\nFormato horizontal 16:9. Genera solo la imagen.' }],
      modalities: ['image', 'text'],
      // Los modelos de Google aceptan la proporción aquí; los demás la ignoran y usan el texto del prompt
      image_config: { aspect_ratio: '16:9' },
      usage: { include: true },
    }),
  })
  if (res.status === 402) throw new Error("Sin saldo en OpenRouter para las imágenes. Recarga créditos en openrouter.ai/settings/credits.")
  if (!res.ok) throw new Error(`OpenRouter imágenes ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const out = await res.json()
  const url: string | undefined = out.choices?.[0]?.message?.images?.[0]?.image_url?.url
  if (!url) throw new Error('El modelo de imagen de OpenRouter no devolvió imagen')
  return { dataUrl: url, usd: Number(out.usage?.cost || 0) }
}
