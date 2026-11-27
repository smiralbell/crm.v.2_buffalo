/**
 * Llamadas a la IA de la calidad, con el coste real de cada una (OpenRouter devuelve
 * tokens y coste si se le pide) y precios de los modelos para estimar antes de rastrear.
 */

/** Barato y bueno en español, con contexto largo. Se cambia con QA_BRAIN_MODEL. */
export const DEFAULT_QA_MODEL = 'anthropic/claude-haiku-5.5'

export function qaModel(): string {
  return process.env.QA_BRAIN_MODEL?.trim() || DEFAULT_QA_MODEL
}

export type ChatUsage = { tokens_in: number; tokens_out: number; cost_usd: number | null }

export async function qaChat(
  messages: { role: 'system' | 'user'; content: string }[],
  opts: { model?: string; maxTokens?: number; json?: boolean; temperature?: number } = {}
): Promise<{ text: string; usage: ChatUsage }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no está configurada')
  const siteUrl = process.env.OPENROUTER_HTTP_REFERER || process.env.NEXT_PUBLIC_BASE_URL || ''
  const body = JSON.stringify({
    model: opts.model || qaModel(),
    messages,
    temperature: opts.temperature ?? 0.1,
    max_tokens: opts.maxTokens ?? 8000,
    usage: { include: true },
    ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
  })
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(siteUrl ? { 'HTTP-Referer': siteUrl } : {}),
        'X-OpenRouter-Title': 'Buffalo CRM - calidad',
      },
      body,
    })
    if (res.status === 429 || res.status >= 500) {
      lastErr = `OpenRouter ${res.status}`
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      continue
    }
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
      error?: { message?: string }
    }
    if (data.error) throw new Error(`OpenRouter: ${data.error.message || 'error'}`)
    return {
      text: data.choices?.[0]?.message?.content || '',
      usage: {
        tokens_in: data.usage?.prompt_tokens || 0,
        tokens_out: data.usage?.completion_tokens || 0,
        cost_usd: typeof data.usage?.cost === 'number' ? data.usage.cost : null,
      },
    }
  }
  throw new Error(`${lastErr}: OpenRouter no respondió tras 3 intentos`)
}

export type QaTool = { name: string; description: string; parameters: Record<string, unknown> }
export type QaToolCall = { id: string; name: string; arguments: string }
export type QaMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string }

/** Un turno con herramientas (para los flujos que leen el MCP), con su coste. */
export async function qaToolTurn(
  messages: QaMessage[],
  tools: QaTool[],
  opts: { model?: string; maxTokens?: number } = {}
): Promise<{ text: string; calls: QaToolCall[]; assistant: QaMessage; usage: ChatUsage }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no está configurada')
  const body = JSON.stringify({
    model: opts.model || qaModel(),
    messages,
    temperature: 0.1,
    max_tokens: opts.maxTokens ?? 8000,
    usage: { include: true },
    tools: tools.map((t) => ({ type: 'function', function: t })),
  })
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-OpenRouter-Title': 'Buffalo CRM - calidad' },
      body,
    })
    if (res.status === 429 || res.status >= 500) {
      lastErr = `OpenRouter ${res.status}`
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      continue
    }
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
      error?: { message?: string }
    }
    if (data.error) throw new Error(`OpenRouter: ${data.error.message || 'error'}`)
    const msg = data.choices?.[0]?.message || {}
    const calls = (msg.tool_calls || []).map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments || '{}' }))
    return {
      text: msg.content || '',
      calls,
      assistant: {
        role: 'assistant',
        content: msg.content ?? null,
        ...(calls.length ? { tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.arguments } })) } : {}),
      },
      usage: {
        tokens_in: data.usage?.prompt_tokens || 0,
        tokens_out: data.usage?.completion_tokens || 0,
        cost_usd: typeof data.usage?.cost === 'number' ? data.usage.cost : null,
      },
    }
  }
  throw new Error(`${lastErr}: OpenRouter no respondió tras 3 intentos`)
}

type Pricing = { prompt: number; completion: number }
let priceCache: { at: number; byId: Record<string, Pricing> } | null = null

/** Precio por token (USD) de un modelo de OpenRouter, con caché de 12 h. */
export async function modelPricing(model: string): Promise<Pricing | null> {
  if (!priceCache || Date.now() - priceCache.at > 12 * 3600_000) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models')
      if (!res.ok) return null
      const data = (await res.json()) as { data?: { id: string; pricing?: { prompt?: string; completion?: string } }[] }
      const byId: Record<string, Pricing> = {}
      for (const m of data.data || []) {
        const p = Number(m.pricing?.prompt)
        const c = Number(m.pricing?.completion)
        if (Number.isFinite(p) && Number.isFinite(c)) byId[m.id] = { prompt: p, completion: c }
      }
      priceCache = { at: Date.now(), byId }
    } catch {
      return null
    }
  }
  return priceCache.byId[model.replace(/^~/, '')] || null
}

/** Unos 3,5 caracteres por token en español y código. */
export function charsToTokens(chars: number): number {
  return Math.ceil(chars / 3.5)
}

export function estimateCost(p: Pricing | null, tokensIn: number, tokensOut: number): number | null {
  return p ? tokensIn * p.prompt + tokensOut * p.completion : null
}
