import type { DemoMessage } from './types'
import {
  CRM_ASSISTANT_TOOLS,
  executeCrmAssistantTool,
} from './crm-assistant-tools'
import { CRM_ASSISTANT_ONTOLOGY } from './crm-assistant-ontology'
import type { CrmDomain } from './crm-assistant-tools'

const DEMO_MODEL_PRIMARY =
  process.env.DEMO_OPENROUTER_MODEL ||
  process.env.OPENROUTER_MODEL ||
  'openai/gpt-4o-mini'

const DEMO_MODEL_FALLBACK = 'openai/gpt-4o-mini'
const MAX_TOOL_ROUNDS = 6

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

type ToolChoice = 'auto' | 'required' | 'none'

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
  model: string,
  toolChoice: ToolChoice
): Promise<{
  content: string | null
  tool_calls?: ChatMessage['tool_calls']
}> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.15,
  }

  if (toolChoice === 'none') {
    // Pasada final: solo texto
  } else {
    body.tools = CRM_ASSISTANT_TOOLS
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

/** Respuestas que prometen consultar y no dan el dato — NO enviar a WhatsApp */
function isDeferredOrEmptyAnswer(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (t.length < 12) return true

  const defer =
    /\b(voy a (consultar|revisar|mirar|buscar|comprobar)|déjame (consultar|revisar|mirar|buscar)|un momento|en seguida|ahora mismo (consulto|reviso|miro)|estoy (consultando|revisando|buscando)|te (digo|respondo|cuento) en (un momento|seguida)|consultar[eé] (en )?el crm|revisar[eé] (en )?el crm)\b/i.test(
      t
    )

  // Promete acción futura sin cifra
  const noNumber = !/\d/.test(t)
  if (defer && noNumber) return true
  if (defer && t.length < 180) return true

  return false
}

/** Heurística: qué subagentes precargar según el mensaje */
function inferDomains(userMessage: string): { domains: CrmDomain[]; entityQuery?: string } {
  const m = userMessage.toLowerCase()

  if (
    /\b(dinero|caja|saldo|cuenta|euros?|€|mrr|arr|factur|cobr|ingreso|gasto|banco|runway|impuesto|iva|beneficio|neto)\b/i.test(
      m
    )
  ) {
    return { domains: ['finance'] }
  }
  if (/\b(ticket|incidencia|soporte|bug|critical|crítico)\b/i.test(m)) {
    return { domains: ['ops'] }
  }
  if (/\b(proyecto|cartera|producción|desarrollo|retenci[oó]n|mensualidad|churn)\b/i.test(m)) {
    return { domains: ['proyectos'] }
  }
  if (/\b(pipeline|lead|comercial|negoci|propuesta|embudo|deal)\b/i.test(m)) {
    return { domains: ['comercial'] }
  }
  if (/\b(cold.?call|marketing|ads|meta|google ads|reuniones? agend)\b/i.test(m)) {
    return { domains: ['marketing'] }
  }
  if (/\b(c[oó]mo vamos|resumen|estado del negocio|overview|dashboard)\b/i.test(m)) {
    return { domains: ['overview'] }
  }

  // "qué hay de X" / "cliente X"
  const entity =
    m.match(/(?:cliente|empresa|lead|de)\s+([a-záéíóúñ0-9][\wáéíóúñ &.-]{1,40})/i)?.[1] ||
    m.match(/qué hay (?:de|del|de la)\s+([a-záéíóúñ0-9][\wáéíóúñ &.-]{1,40})/i)?.[1]
  if (entity && entity.trim().length >= 2) {
    return { domains: ['cliente'], entityQuery: entity.trim() }
  }

  return { domains: ['overview'] }
}

async function prefetchDomainData(userMessage: string): Promise<string | null> {
  try {
    const inferred = inferDomains(userMessage)
    const data = await executeCrmAssistantTool('run_domain_agent', {
      domains: inferred.domains,
      entity_query: inferred.entityQuery || '',
    })
    return JSON.stringify({
      prefetched_domains: inferred.domains,
      entity_query: inferred.entityQuery || null,
      data,
    }).slice(0, 28000)
  } catch (e) {
    console.warn(
      '[crm-assistant] prefetch falló',
      e instanceof Error ? e.message : e
    )
    return null
  }
}

async function synthesizeFinalAnswer(
  messages: ChatMessage[],
  model: string
): Promise<string> {
  const result = await chatWithTools(
    [
      ...messages,
      {
        role: 'user',
        content:
          'IMPORTANTE: Ya tienes los datos del CRM arriba. Responde AHORA al usuario con cifras concretas en formato WhatsApp. PROHIBIDO decir que vas a consultar, revisar o mirar el CRM. Si falta un dato, dilo explícitamente («no lo veo»). Sin markdown ni asteriscos.',
      },
    ],
    model,
    'none'
  )
  return (result.content || '').trim()
}

/**
 * Orquestador: precarga datos → tools si hace falta → respuesta final única a WhatsApp.
 * Nunca envía mensajes intermedios del tipo «voy a consultar…».
 */
export async function generateCrmAssistantReply(
  systemPrompt: string,
  extraKnowledge: string,
  history: DemoMessage[],
  userMessage: string
): Promise<string> {
  const system = `${systemPrompt.trim()}

${CRM_ASSISTANT_ONTOLOGY}

${extraKnowledge.trim() ? `---\nNOTAS DEL USUARIO / BASE EXTRA:\n${extraKnowledge.trim()}\n---` : ''}

PROTOCOLO OBLIGATORIO
1) Usa tools/subagentes ANTES de afirmar cifras (o usa DATOS PRECARGADOS si ya están).
2) NUNCA digas «voy a consultar», «un momento», «déjame revisar». WhatsApp solo recibe UNA respuesta final con datos.
3) Prefiere run_domain_agent / lookup_entity.
4) Formato WhatsApp: sin markdown ni asteriscos; párrafos con línea en blanco; alertas → cifra → acción.`

  const messages: ChatMessage[] = [{ role: 'system', content: system }]

  for (const msg of history.slice(-12)) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    })
  }
  messages.push({ role: 'user', content: userMessage })

  // Precarga paralela: evita el «voy a consultar» y acelera dinero/caja/etc.
  const prefetched = await prefetchDomainData(userMessage)
  let toolsUsed = false
  if (prefetched) {
    toolsUsed = true
    messages.push({
      role: 'system',
      content: `DATOS PRECARGADOS DEL CRM (ya consultados; úsalos para responder ya):\n${prefetched}`,
    })
  }

  let model = DEMO_MODEL_PRIMARY

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Si aún no hay datos, forzar tool call. Si ya hay prefetch, dejar auto/none path.
    const toolChoice: ToolChoice = !toolsUsed ? 'required' : round === 0 ? 'auto' : 'auto'

    let result: Awaited<ReturnType<typeof chatWithTools>>
    try {
      result = await chatWithTools(messages, model, toolChoice)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      const isModelError =
        msg.includes('404') ||
        msg.includes('No endpoints found') ||
        msg.includes('not a valid model') ||
        msg.includes('tool') ||
        msg.includes('tool_choice')
      if (!isModelError || model === DEMO_MODEL_FALLBACK) {
        // Algunos modelos no soportan tool_choice=required → reintentar auto
        if (toolChoice === 'required' && (msg.includes('tool_choice') || msg.includes('400'))) {
          result = await chatWithTools(messages, model, 'auto')
        } else {
          throw err
        }
      } else {
        console.warn(`[crm-assistant] Modelo ${model} falló, usando ${DEMO_MODEL_FALLBACK}`)
        model = DEMO_MODEL_FALLBACK
        result = await chatWithTools(messages, model, toolChoice === 'required' ? 'auto' : toolChoice)
      }
    }

    const toolCalls = result.tool_calls
    if (toolCalls?.length) {
      toolsUsed = true
      // Ignorar content intermedio («voy a consultar…»): no se envía a WhatsApp
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: toolCalls,
      })

      for (const call of toolCalls) {
        const args = parseToolArgs(call.function.arguments)
        const toolResult = await executeCrmAssistantTool(call.function.name, args)
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(toolResult).slice(0, 28000),
        })
      }
      continue
    }

    const text = (result.content || '').trim()
    if (text && !isDeferredOrEmptyAnswer(text) && toolsUsed) {
      return text
    }

    // Respuesta vacía / «voy a consultar» → forzar más tools o síntesis
    if (!toolsUsed) {
      messages.push({
        role: 'user',
        content:
          'Debes llamar ahora a run_domain_agent (o lookup_entity). No respondas al usuario todavía.',
      })
      continue
    }

    // Ya hay datos pero el modelo dilata → síntesis forzada sin tools
    const finalText = await synthesizeFinalAnswer(messages, model)
    if (finalText && !isDeferredOrEmptyAnswer(finalText)) {
      return finalText
    }

    messages.push({
      role: 'user',
      content:
        'Responde ya con los datos precargados/tools. Prohibido posponer. Incluye números si existen en el JSON.',
    })
  }

  const lastChance = await synthesizeFinalAnswer(messages, model)
  if (lastChance && !isDeferredOrEmptyAnswer(lastChance)) {
    return lastChance
  }

  // Fallback determinista si el LLM sigue dilatando
  if (prefetched) {
    try {
      const parsed = JSON.parse(prefetched) as {
        data?: { finance?: { kpis?: { cash_balance?: number; mrr?: number } } }
      }
      const cash = parsed.data?.finance?.kpis?.cash_balance
      const mrr = parsed.data?.finance?.kpis?.mrr
      if (typeof cash === 'number') {
        const parts = [`Saldo en cuenta (último extracto): ${cash.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}.`]
        if (typeof mrr === 'number') {
          parts.push(
            `MRR marcado en banco: ${mrr.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}/mes.`
          )
        }
        return parts.join('\n\n')
      }
    } catch {
      // ignore
    }
  }

  throw new Error(
    'El asistente obtuvo datos del CRM pero no generó una respuesta útil. Reintenta la pregunta.'
  )
}
