import type { DemoMessage } from './types'
import {
  CRM_ASSISTANT_TOOLS,
  executeCrmAssistantTool,
} from './crm-assistant-tools'

const DEMO_MODEL_PRIMARY =
  process.env.DEMO_OPENROUTER_MODEL ||
  process.env.OPENROUTER_MODEL ||
  'openai/gpt-4o-mini'

const DEMO_MODEL_FALLBACK = 'openai/gpt-4o-mini'
const MAX_TOOL_ROUNDS = 4

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

function openRouterHeaders(): Record<string, string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no está configurada')
  const siteUrl = process.env.OPENROUTER_HTTP_REFERER || process.env.NEXT_PUBLIC_BASE_URL || ''
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(siteUrl ? { 'HTTP-Referer': siteUrl } : {}),
    'X-OpenRouter-Title': 'Buffalo CRM - asistente personal WhatsApp',
  }
}

async function chatWithTools(
  messages: ChatMessage[],
  model: string
): Promise<{
  content: string | null
  tool_calls?: ChatMessage['tool_calls']
}> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model,
      messages,
      tools: CRM_ASSISTANT_TOOLS,
      tool_choice: 'auto',
      temperature: 0.25,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 500)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: ChatMessage['tool_calls']
      }
    }>
  }

  const msg = data.choices?.[0]?.message
  return {
    content: msg?.content ?? null,
    tool_calls: msg?.tool_calls,
  }
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}')
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Respuesta del asistente personal CRM por WhatsApp (con tools sobre el CRM).
 */
export async function generateCrmAssistantReply(
  systemPrompt: string,
  extraKnowledge: string,
  history: DemoMessage[],
  userMessage: string
): Promise<string> {
  const system = `${systemPrompt.trim()}

${extraKnowledge.trim() ? `Notas adicionales del usuario:\n${extraKnowledge.trim()}\n` : ''}
FORMATO DE RESPUESTA (obligatorio en el mensaje final al usuario):
- NO uses markdown, negritas ni asteriscos (*).
- Párrafos separados por una línea en blanco.
- Habla como en WhatsApp: claro y útil.
- Usa las herramientas antes de afirmar datos del CRM.`

  const messages: ChatMessage[] = [{ role: 'system', content: system }]

  for (const msg of history.slice(-16)) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    })
  }
  messages.push({ role: 'user', content: userMessage })

  let model = DEMO_MODEL_PRIMARY

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let result: Awaited<ReturnType<typeof chatWithTools>>
    try {
      result = await chatWithTools(messages, model)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      const isModelError =
        msg.includes('404') ||
        msg.includes('No endpoints found') ||
        msg.includes('not a valid model') ||
        msg.includes('tool')
      if (!isModelError || model === DEMO_MODEL_FALLBACK) throw err
      console.warn(`[crm-assistant] Modelo ${model} falló, usando ${DEMO_MODEL_FALLBACK}`)
      model = DEMO_MODEL_FALLBACK
      result = await chatWithTools(messages, model)
    }

    const toolCalls = result.tool_calls
    if (!toolCalls?.length) {
      const text = (result.content || '').trim()
      if (text) return text
      throw new Error('El asistente CRM no devolvió respuesta')
    }

    messages.push({
      role: 'assistant',
      content: result.content,
      tool_calls: toolCalls,
    })

    for (const call of toolCalls) {
      const args = parseToolArgs(call.function.arguments)
      const toolResult = await executeCrmAssistantTool(call.function.name, args)
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(toolResult).slice(0, 24000),
      })
    }
  }

  // Última pasada sin tools forzando respuesta
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model,
      messages: [
        ...messages,
        {
          role: 'user',
          content:
            'Con la información ya obtenida, responde ahora al usuario de forma definitiva (sin pedir más tools).',
        },
      ],
      temperature: 0.25,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 500)}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('El asistente CRM no devolvió respuesta final')
  return content
}
