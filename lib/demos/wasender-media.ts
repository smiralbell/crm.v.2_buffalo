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

export async function decryptWasenderMedia(
  webhookBody: unknown
): Promise<{ publicUrl: string; mimetype?: string }> {
  if (!webhookBody || typeof webhookBody !== 'object') {
    throw new Error('Payload de webhook inválido para desencriptar media')
  }

  const root = webhookBody as Record<string, unknown>
  const data = root.data
  if (!data || typeof data !== 'object') {
    throw new Error('Webhook sin data para desencriptar media')
  }

  const res = await fetch(`${WASENDER_API_BASE}/api/decrypt-media`, {
    method: 'POST',
    headers: wasenderHeaders(),
    body: JSON.stringify({ data }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Wasender decrypt-media ${res.status}: ${errText.slice(0, 400)}`)
  }

  const json = (await res.json()) as {
    publicUrl?: string
    mimetype?: string
    mimeType?: string
  }

  const publicUrl = json.publicUrl
  if (!publicUrl) throw new Error('Wasender no devolvió publicUrl del media')

  return {
    publicUrl,
    mimetype: json.mimetype || json.mimeType,
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
