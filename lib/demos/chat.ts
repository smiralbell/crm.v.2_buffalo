import { openRouterChatCompletion } from '@/lib/openrouter'
import { demoUsesRagTool, searchDemoKnowledge } from '@/lib/demos/kb-rag'
import type { DemoMessage } from './types'

/** Modelo para demos — configurable en EasyPanel con DEMO_OPENROUTER_MODEL */
const DEMO_MODEL_PRIMARY =
  process.env.DEMO_OPENROUTER_MODEL || '~anthropic/claude-sonnet-latest'

const DEMO_MODEL_FALLBACK = 'openai/gpt-4o-mini'
const MAX_TOOL_ROUNDS = 4

const FORMAT_RULES = `FORMATO DE RESPUESTA (obligatorio):
- NO uses markdown, negritas ni asteriscos (*) en ningún caso.
- Estructura la respuesta en PÁRRAFOS separados por una línea en blanco (doble salto de línea).
- Cada párrafo o bloque (intro, datos de contacto, lista de servicios, equipo, políticas…) irá en un mensaje de WhatsApp distinto.
- Las listas con viñetas (· o -) van dentro del mismo párrafo, no cada ítem en un mensaje aparte.
- Escribe como un humano en chat, sin formato especial.`

const SEARCH_KNOWLEDGE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_knowledge',
    description:
      'Busca en la base de conocimiento de la empresa (RAG). Úsala cuando el usuario pregunte por productos, precios, servicios, horarios, políticas, FAQs u otros datos de la empresa. No inventes: primero busca.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Consulta corta en lenguaje natural con lo que necesitas encontrar (ej. "precios del plan mensual", "horario de atención").',
        },
        top_k: {
          type: 'integer',
          description: 'Número de trozos a recuperar (1-8). Por defecto 5.',
        },
      },
      required: ['query'],
    },
  },
}

type ToolChatMessage = {
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
    'X-OpenRouter-Title': 'Buffalo CRM - demos WhatsApp RAG',
  }
}

async function chatWithKnowledgeTool(
  messages: ToolChatMessage[],
  model: string,
  toolChoice: 'auto' | 'required' | 'none' = 'auto'
): Promise<{ content: string | null; tool_calls?: ToolChatMessage['tool_calls'] }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.4,
  }
  if (toolChoice !== 'none') {
    body.tools = [SEARCH_KNOWLEDGE_TOOL]
    body.tool_choice = toolChoice
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 500)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: ToolChatMessage['tool_calls']
      }
    }>
  }
  const msg = data.choices?.[0]?.message
  return {
    content: msg?.content ?? null,
    tool_calls: msg?.tool_calls,
  }
}

function buildHistoryMessages(history: DemoMessage[], userMessage: string): ToolChatMessage[] {
  const messages: ToolChatMessage[] = []
  for (const msg of history) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    })
  }
  messages.push({ role: 'user', content: userMessage })
  return messages
}

async function generateWithFullKnowledge(
  systemPrompt: string,
  knowledgeBase: string,
  history: DemoMessage[],
  userMessage: string
): Promise<string> {
  const system = `${systemPrompt.trim()}

---

BASE DE CONOCIMIENTO DEL CLIENTE:
${knowledgeBase.trim()}

Responde en el mismo idioma que use el usuario. Sé conciso y útil. No inventes datos que no estén en la base de conocimiento; si no sabes algo, dilo con naturalidad.

${FORMAT_RULES}`

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: system },
  ]
  for (const msg of history) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    })
  }
  messages.push({ role: 'user', content: userMessage })

  try {
    return await openRouterChatCompletion(messages, {
      model: DEMO_MODEL_PRIMARY,
      temperature: 0.4,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    const isModelError =
      msg.includes('404') ||
      msg.includes('No endpoints found') ||
      msg.includes('not a valid model')
    if (!isModelError || DEMO_MODEL_PRIMARY === DEMO_MODEL_FALLBACK) throw err
    console.warn(
      `[demos/chat] Modelo ${DEMO_MODEL_PRIMARY} no disponible, usando ${DEMO_MODEL_FALLBACK}`
    )
    return openRouterChatCompletion(messages, {
      model: DEMO_MODEL_FALLBACK,
      temperature: 0.4,
    })
  }
}

async function generateWithRagTool(
  systemPrompt: string,
  demoId: number,
  history: DemoMessage[],
  userMessage: string
): Promise<string> {
  const system = `${systemPrompt.trim()}

---

CONOCIMIENTO DE LA EMPRESA (RAG):
Tienes la herramienta search_knowledge. Cuando el usuario pregunte por datos de la empresa (servicios, precios, horarios, productos, políticas, contacto, FAQs…), DEBES llamar a search_knowledge ANTES de responder.
No inventes información. Si search_knowledge no devuelve nada útil, dilo con naturalidad.
Responde en el mismo idioma que use el usuario. Sé conciso y útil.

${FORMAT_RULES}`

  const messages: ToolChatMessage[] = [
    { role: 'system', content: system },
    ...buildHistoryMessages(history, userMessage),
  ]

  let model = DEMO_MODEL_PRIMARY
  let usedTool = false

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let result: { content: string | null; tool_calls?: ToolChatMessage['tool_calls'] }
    try {
      const toolChoice = !usedTool && round === 0 ? 'auto' : 'auto'
      result = await chatWithKnowledgeTool(messages, model, toolChoice)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (
        model !== DEMO_MODEL_FALLBACK &&
        (msg.includes('404') || msg.includes('No endpoints found') || msg.includes('not a valid model'))
      ) {
        model = DEMO_MODEL_FALLBACK
        result = await chatWithKnowledgeTool(messages, model, 'auto')
      } else {
        throw err
      }
    }

    const toolCalls = result.tool_calls
    if (toolCalls?.length) {
      usedTool = true
      messages.push({
        role: 'assistant',
        content: result.content,
        tool_calls: toolCalls,
      })
      for (const call of toolCalls) {
        let args: { query?: string; top_k?: number } = {}
        try {
          args = JSON.parse(call.function.arguments || '{}') as typeof args
        } catch {
          args = {}
        }
        const name = call.function.name
        let payload: unknown
        if (name === 'search_knowledge') {
          const hits = await searchDemoKnowledge(
            demoId,
            String(args.query || userMessage),
            args.top_k ?? 5
          )
          payload = {
            query: args.query || userMessage,
            results: hits.map((h) => ({
              score: Math.round(h.score * 1000) / 1000,
              content: h.content,
            })),
            hint:
              hits.length === 0
                ? 'Sin resultados relevantes. Di que no tienes ese dato y no inventes.'
                : 'Usa solo estos trozos para responder.',
          }
        } else {
          payload = { error: `Tool desconocida: ${name}` }
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name,
          content: JSON.stringify(payload).slice(0, 12000),
        })
      }
      continue
    }

    const text = (result.content || '').trim()
    if (text) return text

    messages.push({
      role: 'user',
      content:
        'Responde ya al usuario. Si te faltan datos de la empresa, llama a search_knowledge.',
    })
  }

  // Último intento sin tools
  const last = await chatWithKnowledgeTool(messages, model, 'none')
  return (last.content || '').trim() || 'Ahora mismo no tengo ese dato. ¿Puedo ayudarte con otra cosa?'
}

export async function generateDemoReply(
  systemPrompt: string,
  knowledgeBase: string,
  history: DemoMessage[],
  userMessage: string,
  options?: { demoId?: number }
): Promise<string> {
  const demoId = options?.demoId
  if (demoId != null) {
    try {
      const useRag = await demoUsesRagTool(demoId, knowledgeBase)
      if (useRag) {
        return await generateWithRagTool(systemPrompt, demoId, history, userMessage)
      }
    } catch (err) {
      console.warn('[demos/chat] RAG no disponible, fallback a KB completa:', err)
    }
  }

  return generateWithFullKnowledge(systemPrompt, knowledgeBase, history, userMessage)
}
