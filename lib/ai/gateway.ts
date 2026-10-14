/**
 * Pasarela IA: todas las llamadas a OpenRouter pasan por `aiFetch`.
 * Devuelve la misma Response que `fetch` (los llamadores no cambian) y, en segundo plano,
 * registra módulo, modelo, tokens, coste y duración en ai_calls.
 */
import { query } from '@/lib/db'

const OPENROUTER_HOST = 'openrouter.ai'

type AiCallMeta = { module?: string }

function endpointOf(url: string): string {
  if (url.includes('/chat/completions')) return 'chat'
  if (url.includes('/embeddings')) return 'embeddings'
  if (url.includes('/audio/')) return 'audio'
  if (url.includes('/images')) return 'images'
  return 'otros'
}

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null
  if (headers instanceof Headers) return headers.get(name)
  if (Array.isArray(headers)) {
    const hit = headers.find(([k]) => k.toLowerCase() === name.toLowerCase())
    return hit ? hit[1] : null
  }
  const rec = headers as Record<string, string>
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? rec[key] : null
}

/**
 * Módulo que hace la llamada, deducido de la pila: el primer `pages/api/<x>` o `lib/<x>`
 * que no sea esta pasarela ni el cliente de OpenRouter.
 */
export function moduleFromStack(stack = new Error().stack || ''): string {
  for (const line of stack.split('\n').slice(1)) {
    const l = line.replace(/\\/g, '/')
    if (/\/lib\/(ai\/gateway|openrouter)\b/.test(l)) continue
    const api = l.match(/pages\/api\/([\w-]+)/)
    if (api) return api[1]
    const lib = l.match(/\/lib\/([\w-]+)/)
    if (lib) return lib[1]
  }
  return 'desconocido'
}

function withUsageAccounting(url: string, body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (typeof body !== 'string' || !url.includes('/chat/completions')) return body
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    if (parsed.stream || parsed.usage) return body
    return JSON.stringify({ ...parsed, usage: { include: true } })
  } catch {
    return body
  }
}

async function record(row: {
  module: string
  title: string | null
  endpoint: string
  model: string | null
  promptTokens: number | null
  completionTokens: number | null
  costUsd: number | null
  durationMs: number
  ok: boolean
  statusCode: number | null
  error: string | null
}) {
  if (process.env.AI_CALL_LOG === '0' || !process.env.DATABASE_URL) return
  try {
    await query(
      `INSERT INTO ai_calls (module, title, endpoint, model, prompt_tokens, completion_tokens,
                             cost_usd, duration_ms, ok, status_code, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, LEFT($11, 1000))`,
      [
        row.module,
        row.title,
        row.endpoint,
        row.model,
        row.promptTokens,
        row.completionTokens,
        row.costUsd,
        row.durationMs,
        row.ok,
        row.statusCode,
        row.error,
      ]
    )
  } catch {
    // el registro nunca debe afectar a la llamada (p. ej. tabla aún sin crear)
  }
}

export async function aiFetch(url: string, init: RequestInit = {}, meta: AiCallMeta = {}): Promise<Response> {
  if (!url.includes(OPENROUTER_HOST)) return fetch(url, init)

  const module = meta.module || moduleFromStack()
  const title = headerValue(init.headers, 'X-OpenRouter-Title')
  const endpoint = endpointOf(url)
  let requestedModel: string | null = null
  if (typeof init.body === 'string') {
    try {
      requestedModel = (JSON.parse(init.body) as { model?: string }).model ?? null
    } catch {
      requestedModel = null
    }
  }

  const started = Date.now()
  let res: Response
  try {
    res = await fetch(url, { ...init, body: withUsageAccounting(url, init.body) })
  } catch (e) {
    void record({
      module, title, endpoint, model: requestedModel, promptTokens: null, completionTokens: null,
      costUsd: null, durationMs: Date.now() - started, ok: false, statusCode: null,
      error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }

  const durationMs = Date.now() - started
  const copy = res.clone()
  void (async () => {
    let model = requestedModel
    let promptTokens: number | null = null
    let completionTokens: number | null = null
    let costUsd: number | null = null
    let error: string | null = null
    try {
      if (res.ok) {
        const data = (await copy.json()) as {
          model?: string
          usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
        }
        model = data.model || model
        promptTokens = data.usage?.prompt_tokens ?? null
        completionTokens = data.usage?.completion_tokens ?? null
        costUsd = typeof data.usage?.cost === 'number' ? data.usage.cost : null
      } else {
        error = (await copy.text()).slice(0, 500)
      }
    } catch {
      // cuerpo no JSON: se registra sin uso
    }
    await record({
      module, title, endpoint, model, promptTokens, completionTokens, costUsd,
      durationMs, ok: res.ok, statusCode: res.status, error,
    })
  })()
  return res
}

export type AiUsageByModule = {
  module: string
  calls: number
  errors: number
  cost_usd: number
  tokens: number
  avg_ms: number
}

export async function aiUsageByModule(days = 30): Promise<AiUsageByModule[]> {
  const { rows } = await query<{
    module: string
    calls: string
    errors: string
    cost_usd: string | null
    tokens: string | null
    avg_ms: string | null
  }>(
    `SELECT module,
            COUNT(*) AS calls,
            COUNT(*) FILTER (WHERE NOT ok) AS errors,
            SUM(cost_usd) AS cost_usd,
            SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) AS tokens,
            AVG(duration_ms) AS avg_ms
       FROM ai_calls
      WHERE created_at >= NOW() - make_interval(days => $1)
      GROUP BY module
      ORDER BY SUM(cost_usd) DESC NULLS LAST, COUNT(*) DESC`,
    [days]
  )
  return rows.map((r) => ({
    module: r.module,
    calls: Number(r.calls),
    errors: Number(r.errors),
    cost_usd: Number(r.cost_usd ?? 0),
    tokens: Number(r.tokens ?? 0),
    avg_ms: Math.round(Number(r.avg_ms ?? 0)),
  }))
}
