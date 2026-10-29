import { FALLBACK_MODEL } from './config'
import type { ToolSchema } from './tools'

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
}

const MAX_TOOL_RESULT = 24_000

function headers(): Record<string, string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no está configurada')
  const siteUrl = process.env.OPENROUTER_HTTP_REFERER || process.env.NEXT_PUBLIC_BASE_URL || ''
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(siteUrl ? { 'HTTP-Referer': siteUrl } : {}),
    'X-OpenRouter-Title': 'Buffalo CRM - agente Telegram',
  }
}

async function complete(
  model: string,
  messages: LlmMessage[],
  tools: ToolSchema[],
  toolChoice: 'auto' | 'none' = 'auto'
): Promise<{ content: string | null; tool_calls?: LlmMessage['tool_calls'] }> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 4000,
      // Las tools van siempre: algunos proveedores las exigen si el historial tiene llamadas.
      ...(tools.length ? { tools, tool_choice: toolChoice } : {}),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: LlmMessage['tool_calls'] } }>
  }
  const msg = data.choices?.[0]?.message
  return { content: msg?.content ?? null, tool_calls: msg?.tool_calls }
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}')
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Bucle agente: el modelo llama herramientas (varias a la vez se ejecutan en paralelo)
 * hasta que contesta con texto o se acaban las rondas.
 */
export async function runToolLoop(input: {
  model: string
  messages: LlmMessage[]
  tools: ToolSchema[]
  maxRounds: number
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown>
}): Promise<string> {
  const messages = input.messages
  let model = input.model

  for (let round = 0; round < input.maxRounds; round++) {
    let result: Awaited<ReturnType<typeof complete>>
    try {
      result = await complete(model, messages, input.tools)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      const modelProblem = /404|No endpoints|not a valid model|model.*not found/i.test(msg)
      if (!modelProblem || model === FALLBACK_MODEL) throw e
      console.warn(`[telegram-agent] modelo ${model} no disponible, uso ${FALLBACK_MODEL}`)
      model = FALLBACK_MODEL
      result = await complete(model, messages, input.tools)
    }

    const calls = result.tool_calls || []
    if (!calls.length) {
      const text = (result.content || '').trim()
      if (text) return text
      messages.push({ role: 'user', content: 'Responde ahora con el resultado.' })
      continue
    }

    messages.push({ role: 'assistant', content: result.content || null, tool_calls: calls })
    const outputs = await Promise.all(
      calls.map(async (call) => {
        const out = await input.execute(call.function.name, parseArgs(call.function.arguments))
        return { call, out }
      })
    )
    for (const { call, out } of outputs) {
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(out ?? null).slice(0, MAX_TOOL_RESULT),
      })
    }
  }

  // Sin rondas: pedir el cierre sin herramientas.
  messages.push({ role: 'user', content: 'Se acabaron las rondas de herramientas. Resume lo hecho y lo que falte.' })
  const last = await complete(model, messages, input.tools, 'none')
  return (last.content || '').trim() || 'He llegado al límite de pasos sin terminar. Dime cómo seguir.'
}
