/** Tabla de memoria Postgres del agente (n8n / LangChain). */
export const AGENT_CHAT_HISTORY_TABLE = 'n8n_chat_histories_botbuffalo'

export type AgentChatRole = 'user' | 'assistant' | 'system' | 'tool' | 'unknown'

export interface ParsedAgentMessage {
  role: AgentChatRole
  text: string
}

function extractTextFromContent(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '')
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (typeof content === 'object' && content !== null && 'text' in content) {
    return String((content as { text?: unknown }).text ?? '')
  }
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

/**
 * Interpreta el JSON guardado por n8n/LangChain en `message`.
 */
export function parseAgentChatMessage(message: unknown): ParsedAgentMessage {
  let raw: unknown = message
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown
    } catch {
      return { role: 'unknown', text: typeof raw === 'string' ? raw : String(raw) }
    }
  }
  if (!raw || typeof raw !== 'object') {
    return { role: 'unknown', text: '' }
  }
  const m = raw as Record<string, unknown>

  if (typeof m.role === 'string' && 'content' in m) {
    if (m.role === 'tool') {
      return { role: 'tool', text: extractTextFromContent(m.content) }
    }
    const r =
      m.role === 'user'
        ? 'user'
        : m.role === 'assistant'
          ? 'assistant'
          : m.role === 'system'
            ? 'system'
            : 'unknown'
    return { role: r, text: extractTextFromContent(m.content) }
  }

  if (m.type === 'tool' && 'content' in m) {
    return { role: 'tool', text: extractTextFromContent(m.content) }
  }

  // n8n / LangChain a veces guarda { type: "human"|"ai", content: "..." } en la raíz (sin .data)
  if (m.type === 'human' && 'content' in m) {
    return { role: 'user', text: extractTextFromContent(m.content) }
  }
  if (m.type === 'ai' && 'content' in m) {
    return { role: 'assistant', text: extractTextFromContent(m.content) }
  }
  if (m.type === 'system' && 'content' in m) {
    return { role: 'system', text: extractTextFromContent(m.content) }
  }

  if (m.kwargs && typeof m.kwargs === 'object') {
    const kwargs = m.kwargs as Record<string, unknown>
    let role: AgentChatRole = 'unknown'
    const id = m.id
    if (Array.isArray(id)) {
      const last = id[id.length - 1]
      if (last === 'HumanMessage') role = 'user'
      else if (last === 'AIMessage' || last === 'AIChatMessage') role = 'assistant'
      else if (last === 'SystemMessage') role = 'system'
      else if (last === 'ToolMessage') role = 'tool'
    }
    return { role, text: extractTextFromContent(kwargs.content) }
  }

  if (m.type === 'human' && m.data && typeof m.data === 'object') {
    return {
      role: 'user',
      text: extractTextFromContent((m.data as Record<string, unknown>).content),
    }
  }
  if (m.type === 'ai' && m.data && typeof m.data === 'object') {
    return {
      role: 'assistant',
      text: extractTextFromContent((m.data as Record<string, unknown>).content),
    }
  }

  return { role: 'unknown', text: extractTextFromContent(raw) }
}

/** Texto tipo "Calling correo with input: {...}" que no debe mostrarse en el chat. */
function isToolInvocationNarration(text: string): boolean {
  const t = text.trim()
  if (/^Calling\s+[\w.-]+\s+with\s+input:/i.test(t)) return true
  if (/^Calling\s+[\w.-]+\s+with\s+arguments?:/i.test(t)) return true
  return false
}

/** Si el CRM no debe mostrar esta fila (tools, ruido de tool-calls, etc.). */
export function shouldHideAgentChatMessage(parsed: ParsedAgentMessage): boolean {
  if (parsed.role === 'tool') return true
  if (isToolInvocationNarration(parsed.text)) return true
  return false
}

export function previewText(text: string, maxLen = 120): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen)}…`
}
