import { findMediaInMessage } from './media'

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

  if ((data as Record<string, unknown>).key || (data as Record<string, unknown>).messageBody) {
    return data as Record<string, unknown>
  }

  return null
}

function buildDecryptPayload(msgObj: Record<string, unknown>): Record<string, unknown> {
  const key = msgObj.key as Record<string, unknown> | undefined
  const message = msgObj.message as Record<string, unknown> | undefined
  const media = findMediaInMessage(message)

  if (!media) {
    throw new Error('No se encontró media en el mensaje para desencriptar')
  }

  return {
    data: {
      messages: {
        ...(key?.id ? { key: { id: key.id } } : {}),
        message: {
          [media.messageKey]: media.mediaObject,
        },
      },
    },
  }
}

export async function decryptWasenderMedia(
  webhookBody: unknown
): Promise<{ publicUrl: string; mimetype?: string }> {
  if (!webhookBody || typeof webhookBody !== 'object') {
    throw new Error('Payload de webhook inválido para desencriptar media')
  }

  const root = webhookBody as Record<string, unknown>
  const msgObj = extractMessageObject(root)
  if (!msgObj) {
    throw new Error('Webhook sin mensaje para desencriptar media')
  }

  const payload = buildDecryptPayload(msgObj)

  const res = await fetch(`${WASENDER_API_BASE}/api/decrypt-media`, {
    method: 'POST',
    headers: wasenderHeaders(),
    body: JSON.stringify(payload),
  })

  const rawText = await res.text()
  let json: Record<string, unknown>
  try {
    json = JSON.parse(rawText) as Record<string, unknown>
  } catch {
    throw new Error(`Wasender decrypt-media ${res.status}: ${rawText.slice(0, 400)}`)
  }

  if (!res.ok) {
    const err =
      (typeof json.error === 'string' && json.error) ||
      (typeof json.message === 'string' && json.message) ||
      rawText.slice(0, 400)
    throw new Error(`Wasender decrypt-media ${res.status}: ${err}`)
  }

  const nested = json.data as Record<string, unknown> | undefined
  const publicUrl =
    (typeof json.publicUrl === 'string' && json.publicUrl) ||
    (typeof nested?.publicUrl === 'string' && nested.publicUrl) ||
    (typeof nested?.url === 'string' && nested.url) ||
    null

  if (!publicUrl) {
    throw new Error('Wasender no devolvió publicUrl del media')
  }

  const media = findMediaInMessage(msgObj.message as Record<string, unknown> | undefined)
  const mediaMime = media?.mediaObject?.mimetype || media?.mediaObject?.mimeType

  return {
    publicUrl,
    mimetype:
      (typeof json.mimetype === 'string' && json.mimetype) ||
      (typeof json.mimeType === 'string' && json.mimeType) ||
      (typeof mediaMime === 'string' ? mediaMime : undefined),
  }
}

export async function fetchMediaAsBase64(
  url: string
): Promise<{ base64: string; mimetype: string }> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`No se pudo descargar el media (${res.status})`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  const mimetype = res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream'
  return { base64: buffer.toString('base64'), mimetype }
}

export function mimetypeToAudioFormat(mimetype: string): string {
  const m = mimetype.toLowerCase()
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a'
  if (m.includes('webm')) return 'webm'
  if (m.includes('wav')) return 'wav'
  if (m.includes('aac')) return 'aac'
  if (m.includes('flac')) return 'flac'
  return 'ogg'
}
