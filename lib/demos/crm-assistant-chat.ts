import type { DemoMessage } from './types'
import {
  CRM_ASSISTANT_TOOLS,
  executeCrmAssistantTool,
} from './crm-assistant-tools'
import { CRM_ASSISTANT_ONTOLOGY } from './crm-assistant-ontology'
import {
  createAssistantContext,
  ensureAttachmentPublicUrl,
  type AssistantAttachment,
  type AssistantRequestContext,
} from './assistant-attachments'
import type { CrmDomain } from './crm-assistant-tools'

const DEMO_MODEL_PRIMARY =
  process.env.DEMO_OPENROUTER_MODEL ||
  process.env.OPENROUTER_MODEL ||
  'openai/gpt-4o-mini'

const DEMO_MODEL_FALLBACK = 'openai/gpt-4o-mini'
const MAX_TOOL_ROUNDS = 8

export type CrmAssistantReply = {
  text: string
  attachments: AssistantAttachment[]
  actions_log: string[]
}

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
    'X-OpenRouter-Title': 'Buffalo CRM - secretaria WhatsApp',
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

  if (toolChoice !== 'none') {
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

function isDeferredOrEmptyAnswer(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (t.length < 12) return true
  const defer =
    /\b(voy a (consultar|revisar|mirar|buscar|comprobar)|déjame (consultar|revisar|mirar|buscar)|un momento|en seguida|ahora mismo (consulto|reviso|miro)|estoy (consultando|revisando|buscando)|te (digo|respondo|cuento) en (un momento|seguida)|consultar[eé] (en )?el crm|revisar[eé] (en )?el crm)\b/i.test(
      t
    )
  const noNumber = !/\d/.test(t)
  if (defer && noNumber) return true
  if (defer && t.length < 180) return true
  return false
}

function inferDomains(userMessage: string): { domains: CrmDomain[]; entityQuery?: string } {
  const m = userMessage.toLowerCase()
  if (
    /\b(dinero|caja|saldo|cuenta|euros?|€|mrr|arr|factur|cobr|ingreso|gasto|banco|runway|impuesto|iva|beneficio|neto|informe financiero)\b/i.test(
      m
    )
  ) {
    return { domains: ['finance'] }
  }
  if (/\b(ticket|incidencia|soporte)\b/i.test(m)) return { domains: ['ops'] }
  if (/\b(proyecto|cartera|producción|retenci[oó]n|mensualidad)\b/i.test(m)) {
    return { domains: ['proyectos'] }
  }
  if (/\b(pipeline|lead|comercial|negoci|propuesta)\b/i.test(m)) {
    return { domains: ['comercial'] }
  }
  if (/\b(cold.?call|marketing|ads)\b/i.test(m)) return { domains: ['marketing'] }
  if (/\b(c[oó]mo vamos|resumen|overview)\b/i.test(m)) return { domains: ['overview'] }

  const entity =
    m.match(/(?:cliente|empresa|lead|de)\s+([a-záéíóúñ0-9][\wáéíóúñ &.-]{1,40})/i)?.[1]
  if (entity && entity.trim().length >= 2) {
    return { domains: ['cliente'], entityQuery: entity.trim() }
  }
  return { domains: ['overview'] }
}

function looksLikeWriteIntent(userMessage: string): boolean {
  return /\b(crea|añade|agrega|apunta|anota|marca|cambia|actualiza|agenda|programa|env[ií]ame|manda(me)?|checklist|tarea|nota|reuni[oó]n|confirma|email|correo|pausa|churn|activa)\b/i.test(
    userMessage
  )
}

async function prefetchDomainData(
  userMessage: string,
  ctx: AssistantRequestContext
): Promise<string | null> {
  if (looksLikeWriteIntent(userMessage)) return null
  try {
    const inferred = inferDomains(userMessage)
    const data = await executeCrmAssistantTool(
      'run_domain_agent',
      {
        domains: inferred.domains,
        entity_query: inferred.entityQuery || '',
      },
      ctx
    )
    return JSON.stringify({
      prefetched_domains: inferred.domains,
      entity_query: inferred.entityQuery || null,
      data,
    }).slice(0, 28000)
  } catch (e) {
    console.warn('[crm-assistant] prefetch', e instanceof Error ? e.message : e)
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
          'Ya tienes datos/acciones. Responde AHORA en WhatsApp con el resultado. PROHIBIDO decir que vas a consultar. Sin markdown ni asteriscos. Si encolaste un documento, dilo.',
      },
    ],
    model,
    'none'
  )
  return (result.content || '').trim()
}

/**
 * Secretaria CRM: lectura + escritura + documentos.
 * Devuelve texto + adjuntos (el webhook los envía por Wasender).
 */
export async function generateCrmAssistantReply(
  systemPrompt: string,
  extraKnowledge: string,
  history: DemoMessage[],
  userMessage: string,
  phone = 'unknown'
): Promise<CrmAssistantReply> {
  const ctx = createAssistantContext(phone)

  const system = `${systemPrompt.trim()}

${CRM_ASSISTANT_ONTOLOGY}

${extraKnowledge.trim() ? `---\nNOTAS EXTRA:\n${extraKnowledge.trim()}\n---` : ''}

PROTOCOLO SECRETARIA
1) Consultas → tools/subagentes (o DATOS PRECARGADOS). Nunca «voy a consultar».
2) Acciones (crear/cambiar/anotar/agendar) → tool con confirm=false primero; si el usuario ya dijo sí/confirma/adelante, usa confirm=true.
3) Documentos/informes → send_crm_report_document o send_text_document (se envían solos por WhatsApp).
4) WhatsApp: sin markdown/asteriscos; párrafos con línea en blanco; alertas → cifra/acción.`

  const messages: ChatMessage[] = [{ role: 'system', content: system }]
  for (const msg of history.slice(-16)) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    })
  }
  messages.push({ role: 'user', content: userMessage })

  const prefetched = await prefetchDomainData(userMessage, ctx)
  let toolsUsed = false
  if (prefetched) {
    toolsUsed = true
    messages.push({
      role: 'system',
      content: `DATOS PRECARGADOS DEL CRM:\n${prefetched}`,
    })
  }

  // Si el usuario confirma, forzar tools de acción
  const userConfirms =
    /\b(s[ií]|dale|ok|okay|adelante|confirma|confirmado|hazlo|procede|vale)\b/i.test(
      userMessage.trim()
    )

  let model = DEMO_MODEL_PRIMARY

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const toolChoice: ToolChoice =
      !toolsUsed || userConfirms || looksLikeWriteIntent(userMessage)
        ? round === 0 && !prefetched
          ? 'required'
          : 'auto'
        : 'auto'

    let result: Awaited<ReturnType<typeof chatWithTools>>
    try {
      result = await chatWithTools(messages, model, toolChoice)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (toolChoice === 'required' && (msg.includes('tool_choice') || msg.includes('400'))) {
        result = await chatWithTools(messages, model, 'auto')
      } else if (
        (msg.includes('404') || msg.includes('No endpoints') || msg.includes('not a valid model')) &&
        model !== DEMO_MODEL_FALLBACK
      ) {
        model = DEMO_MODEL_FALLBACK
        result = await chatWithTools(messages, model, 'auto')
      } else {
        throw err
      }
    }

    const toolCalls = result.tool_calls
    if (toolCalls?.length) {
      toolsUsed = true
      messages.push({ role: 'assistant', content: null, tool_calls: toolCalls })
      for (const call of toolCalls) {
        const args = parseToolArgs(call.function.arguments)
        const toolResult = await executeCrmAssistantTool(call.function.name, args, ctx)
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
    if (text && !isDeferredOrEmptyAnswer(text) && (toolsUsed || looksLikeWriteIntent(userMessage))) {
      return await finalizeReply(text, ctx)
    }

    if (!toolsUsed) {
      messages.push({
        role: 'user',
        content:
          'Debes usar tools ahora (run_domain_agent, checklist_*, append_lead_note, etc.). No respondas todavía al usuario.',
      })
      continue
    }

    const finalText = await synthesizeFinalAnswer(messages, model)
    if (finalText && !isDeferredOrEmptyAnswer(finalText)) {
      return await finalizeReply(finalText, ctx)
    }

    messages.push({
      role: 'user',
      content: 'Responde ya con el resultado de las tools. Prohibido posponer.',
    })
  }

  const last = await synthesizeFinalAnswer(messages, model)
  if (last && !isDeferredOrEmptyAnswer(last)) {
    return await finalizeReply(last, ctx)
  }

  if (ctx.attachments.length > 0) {
    return finalizeReply('Te envío el documento adjunto.', ctx)
  }

  throw new Error('El asistente no generó una respuesta útil. Reintenta.')
}

async function finalizeReply(
  text: string,
  ctx: AssistantRequestContext
): Promise<CrmAssistantReply> {
  const attachments: AssistantAttachment[] = []
  for (const att of ctx.attachments) {
    attachments.push(await ensureAttachmentPublicUrl(att))
  }
  return {
    text,
    attachments,
    actions_log: ctx.actionsLog,
  }
}
