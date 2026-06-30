const WASENDER_API_BASE =
  process.env.WASENDER_API_BASE_URL || 'https://www.wasenderapi.com'

export interface ParsedWasenderMessage {
  senderPhone: string
  text: string
  fromMe: boolean
  event: string | null
}

function dig(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj
  for (const key of keys) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

export function parseWasenderWebhook(body: unknown): ParsedWasenderMessage | null {
  if (!body || typeof body !== 'object') return null

  const event =
    typeof (body as Record<string, unknown>).event === 'string'
      ? ((body as Record<string, unknown>).event as string)
      : null

  if (event && event !== 'messages.received' && event !== 'messages.upsert') {
    return null
  }

  const messages = dig(body, 'data', 'messages')
  const msgObj =
    messages && typeof messages === 'object' && !Array.isArray(messages)
      ? (messages as Record<string, unknown>)
      : Array.isArray(messages) && messages[0] && typeof messages[0] === 'object'
        ? (messages[0] as Record<string, unknown>)
        : null

  if (!msgObj) return null

  const key = msgObj.key as Record<string, unknown> | undefined
  const fromMe = Boolean(key?.fromMe)
  if (fromMe) return null

  const senderRaw =
    (typeof key?.cleanedSenderPn === 'string' && key.cleanedSenderPn) ||
    (typeof key?.cleanedParticipantPn === 'string' && key.cleanedParticipantPn) ||
    (typeof key?.remoteJid === 'string' && key.remoteJid) ||
    ''

  const text =
    (typeof msgObj.messageBody === 'string' && msgObj.messageBody.trim()) ||
    (typeof dig(msgObj, 'message', 'conversation') === 'string'
      ? (dig(msgObj, 'message', 'conversation') as string).trim()
      : '') ||
    (typeof dig(msgObj, 'message', 'extendedTextMessage', 'text') === 'string'
      ? (dig(msgObj, 'message', 'extendedTextMessage', 'text') as string).trim()
      : '')

  if (!senderRaw || !text) return null

  return {
    senderPhone: senderRaw,
    text,
    fromMe,
    event,
  }
}

export async function sendWasenderTextMessage(to: string, text: string): Promise<void> {
  const apiKey = process.env.WASENDER_API_KEY
  if (!apiKey) {
    throw new Error('WASENDER_API_KEY no está configurada')
  }

  const res = await fetch(`${WASENDER_API_BASE}/api/send-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, text }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Wasender ${res.status}: ${errText.slice(0, 500)}`)
  }
}
