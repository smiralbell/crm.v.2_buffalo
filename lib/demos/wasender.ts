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

/** Duración total estimada de escritura humana */
export function typingDelayMs(text: string): number {
  const base = 1200
  const perChar = 35
  const max = 9000
  const min = 1500
  return Math.min(max, Math.max(min, base + text.length * perChar))
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

const INCOMING_EVENTS = new Set([
  'messages.received',
  'messages-personal.received',
  'message.received',
])

export interface ParsedWasenderMessage {
  messageId: string | null
  senderPhone: string
  text: string
  fromMe: boolean
  event: string | null
  mediaType: DemoMediaKind | 'text'
  hasMedia: boolean
  mediaReadable: boolean
  mediaCaption: string
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

import {
  findMediaInMessage,
  type DemoMediaKind,
} from './media'

export type { DemoMediaKind }

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

  const mediaInfo = findMediaInMessage(msgObj.message as Record<string, unknown> | undefined)
  const hasMedia = mediaInfo !== null
  const mediaType: DemoMediaKind | 'text' = mediaInfo?.kind ?? 'text'
  const mediaReadable = mediaInfo?.readable ?? false
  const mediaCaption = mediaInfo?.caption ?? ''

  const text =
    (typeof msgObj.messageBody === 'string' && msgObj.messageBody.trim()) ||
    (typeof dig(msgObj, 'message', 'conversation') === 'string'
      ? (dig(msgObj, 'message', 'conversation') as string).trim()
      : '') ||
    (typeof dig(msgObj, 'message', 'extendedTextMessage', 'text') === 'string'
      ? (dig(msgObj, 'message', 'extendedTextMessage', 'text') as string).trim()
      : '') ||
    mediaCaption

  if (!senderRaw) {
    return {
      ok: false,
      reason: 'Sin teléfono del remitente (cleanedSenderPn)',
      reason_code: 'no_sender',
      event,
      debug: { key_fields: key ? Object.keys(key) : [] },
    }
  }

  if (!text && !hasMedia) {
    return {
      ok: false,
      reason: 'Mensaje sin texto ni multimedia soportada',
      reason_code: 'no_content',
      event,
      debug: { sender_raw: senderRaw },
    }
  }

  return {
    ok: true,
    data: {
      messageId: typeof key?.id === 'string' && key.id ? key.id : null,
      senderPhone: senderRaw,
      text,
      fromMe,
      event,
      mediaType,
      hasMedia,
      mediaReadable,
      mediaCaption,
    },
  }
}

export async function sendWasenderPresence(
  jid: string,
  type: 'composing' | 'recording' | 'available' | 'unavailable' | 'paused',
  delayMs?: number
): Promise<void> {
  const body: Record<string, unknown> = { jid, type }
  if (delayMs && delayMs > 0) body.delayMs = delayMs

  const res = await fetch(`${WASENDER_API_BASE}/api/send-presence-update`, {
    method: 'POST',
    headers: wasenderHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.warn(`[wasender] presence ${type} ${res.status}: ${errText.slice(0, 200)}`)
  }
}

export async function sendWasenderPresenceComposing(
  jid: string,
  delayMs?: number
): Promise<void> {
  await sendWasenderPresence(jid, 'composing', delayMs)
}

/** Simula escritura humana: escribiendo → pausa → escribiendo → … */
async function simulateHumanTyping(jid: string, text: string): Promise<void> {
  const totalMs = typingDelayMs(text)
  const pulses =
    text.length > 400 ? 4 : text.length > 200 ? 3 : text.length > 80 ? 3 : 2

  for (let p = 0; p < pulses; p++) {
    const composeMs = randomBetween(totalMs / pulses * 0.45, totalMs / pulses * 0.75)
    await sendWasenderPresence(jid, 'composing', composeMs)
    await sleep(composeMs)

    if (p < pulses - 1) {
      await sendWasenderPresence(jid, 'paused')
      await sleep(randomBetween(400, 1100))
    }
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
 * Envía varios mensajes con indicador "escribiendo…" natural entre ellos.
 */
export async function sendWasenderMessageSequence(
  recipient: string,
  jid: string,
  messages: string[]
): Promise<void> {
  if (messages.length === 0) return

  for (let i = 0; i < messages.length; i++) {
    const text = messages[i]

    await simulateHumanTyping(jid, text)
    await sendWasenderTextMessage(recipient, text)

    if (i < messages.length - 1) {
      await sendWasenderPresence(jid, 'paused')
      await sleep(randomBetween(600, 1400))
    }
  }
}
