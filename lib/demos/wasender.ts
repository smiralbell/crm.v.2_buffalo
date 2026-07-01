const WASENDER_API_BASE =
  process.env.WASENDER_API_BASE_URL || 'https://www.wasenderapi.com'

function wasenderHeaders(): Record<string, string> {
  const apiKey = process.env.WASENDER_API_KEY
  if (!apiKey) throw new Error('WASENDER_API_KEY no está configurada')
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Duración del indicador "escribiendo…" según longitud del mensaje */
export function typingDelayMs(text: string): number {
  const base = 700
  const perChar = 28
  const max = 4500
  const min = 600
  return Math.min(max, Math.max(min, base + text.length * perChar))
}

const INCOMING_EVENTS = new Set([
  'messages.received',
  'messages.upsert',
  'messages-personal.received',
  'message.received',
])

export interface ParsedWasenderMessage {
  senderPhone: string
  text: string
  fromMe: boolean
  event: string | null
}

export type ParseWasenderResult =
  | { ok: true; data: ParsedWasenderMessage }
  | {
      ok: false
      reason: string
      reason_code: string
      event?: string | null
      debug?: Record<string, unknown>
    }

function dig(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj
  for (const key of keys) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function extractMessageObject(body: Record<string, unknown>): Record<string, unknown> | null {
  const data = body.data
  if (!data || typeof data !== 'object') return null

  const messages = (data as Record<string, unknown>).messages
  if (messages && typeof messages === 'object' && !Array.isArray(messages)) {
    return messages as Record<string, unknown>
  }
  if (Array.isArray(messages) && messages[0] && typeof messages[0] === 'object') {
    return messages[0] as Record<string, unknown>
  }

  // Algunos payloads traen el mensaje directamente en data
  if ((data as Record<string, unknown>).key || (data as Record<string, unknown>).messageBody) {
    return data as Record<string, unknown>
  }

  return null
}

export function parseWasenderWebhook(body: unknown): ParseWasenderResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'Body vacío o no JSON', reason_code: 'empty_body' }
  }

  const root = body as Record<string, unknown>
  const event = typeof root.event === 'string' ? root.event : null

  if (event && !INCOMING_EVENTS.has(event)) {
    return {
      ok: false,
      reason: `Evento ignorado: ${event}`,
      reason_code: 'event_ignored',
      event,
      debug: { tip: 'Activa messages.received en Wasender' },
    }
  }

  const msgObj = extractMessageObject(root)
  if (!msgObj) {
    return {
      ok: false,
      reason: 'No se encontró data.messages en el payload',
      reason_code: 'no_messages',
      event,
      debug: { keys: Object.keys(root) },
    }
  }

  const key = msgObj.key as Record<string, unknown> | undefined
  const fromMe = Boolean(key?.fromMe)
  if (fromMe) {
    return {
      ok: false,
      reason: 'Mensaje saliente (fromMe), ignorado',
      reason_code: 'from_me',
      event,
    }
  }

  const senderRaw =
    (typeof key?.cleanedSenderPn === 'string' && key.cleanedSenderPn) ||
    (typeof key?.cleanedParticipantPn === 'string' && key.cleanedParticipantPn) ||
    (typeof key?.remoteJid === 'string' && key.remoteJid.replace(/@.*$/, '')) ||
    ''

  const text =
    (typeof msgObj.messageBody === 'string' && msgObj.messageBody.trim()) ||
    (typeof dig(msgObj, 'message', 'conversation') === 'string'
      ? (dig(msgObj, 'message', 'conversation') as string).trim()
      : '') ||
    (typeof dig(msgObj, 'message', 'extendedTextMessage', 'text') === 'string'
      ? (dig(msgObj, 'message', 'extendedTextMessage', 'text') as string).trim()
      : '')

  if (!senderRaw) {
    return {
      ok: false,
      reason: 'Sin teléfono del remitente (cleanedSenderPn)',
      reason_code: 'no_sender',
      event,
      debug: { key_fields: key ? Object.keys(key) : [] },
    }
  }

  if (!text) {
    return {
      ok: false,
      reason: 'Mensaje sin texto (¿audio/imagen sin caption?)',
      reason_code: 'no_text',
      event,
      debug: { sender_raw: senderRaw },
    }
  }

  return {
    ok: true,
    data: {
      senderPhone: senderRaw,
      text,
      fromMe,
      event,
    },
  }
}

export async function sendWasenderPresenceComposing(
  jid: string,
  delayMs?: number
): Promise<void> {
  const body: Record<string, unknown> = { jid, type: 'composing' }
  if (delayMs && delayMs > 0) body.delayMs = delayMs

  const res = await fetch(`${WASENDER_API_BASE}/api/send-presence-update`, {
    method: 'POST',
    headers: wasenderHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.warn(`[wasender] presence composing ${res.status}: ${errText.slice(0, 200)}`)
  }
}

export async function sendWasenderTextMessage(to: string, text: string): Promise<void> {
  const res = await fetch(`${WASENDER_API_BASE}/api/send-message`, {
    method: 'POST',
    headers: wasenderHeaders(),
    body: JSON.stringify({ to, text }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Wasender ${res.status}: ${errText.slice(0, 500)}`)
  }
}

/**
 * Envía varios mensajes con pausas e indicador "escribiendo…" entre ellos.
 */
export async function sendWasenderMessageSequence(
  recipient: string,
  jid: string,
  messages: string[]
): Promise<void> {
  if (messages.length === 0) return

  for (let i = 0; i < messages.length; i++) {
    const text = messages[i]
    const delay = typingDelayMs(text)

    await sendWasenderPresenceComposing(jid, delay)
    await sleep(delay)

    await sendWasenderTextMessage(recipient, text)

    if (i < messages.length - 1) {
      const gap = 400 + Math.min(1200, text.length * 15)
      await sleep(gap)
    }
  }
}
