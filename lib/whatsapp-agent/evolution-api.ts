import { splitText } from '@/lib/telegram-agent/telegram-api'
import { evolutionApiKey, evolutionBaseUrl, evolutionInstance, normalizePhone } from './config'

/**
 * Cliente mínimo de Evolution API (v2). Todo va contra la instancia de
 * EVOLUTION_INSTANCE: el número del agente es el que tenga conectado.
 */

async function call<T = unknown>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const base = evolutionBaseUrl()
  if (!base) throw new Error('Falta EVOLUTION_API_URL')
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { apikey: evolutionApiKey(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const detail =
      (data as { response?: { message?: unknown }; message?: unknown })?.response?.message ??
      (data as { message?: unknown })?.message ??
      text
    throw new Error(`Evolution ${path.split('/').slice(0, 3).join('/')} ${res.status}: ${JSON.stringify(detail).slice(0, 300)}`)
  }
  return data as T
}

function inst(): string {
  const name = evolutionInstance()
  if (!name) throw new Error('Falta EVOLUTION_INSTANCE')
  return encodeURIComponent(name)
}

export async function sendWhatsAppText(phone: string, text: string): Promise<void> {
  const number = normalizePhone(phone)
  for (const part of splitText(text || '…')) {
    await call('POST', `/message/sendText/${inst()}`, { number, text: part, linkPreview: false })
  }
}

/** «Escribiendo…» durante unos segundos. Si falla no pasa nada. */
export async function sendWhatsAppTyping(phone: string, ms = 5000): Promise<void> {
  await call('POST', `/chat/sendPresence/${inst()}`, {
    number: normalizePhone(phone),
    presence: 'composing',
    delay: ms,
  }).catch(() => {})
}

export async function sendWhatsAppDocument(
  phone: string,
  file: { filename: string; buffer: Buffer; mime?: string; caption?: string }
): Promise<void> {
  await call('POST', `/message/sendMedia/${inst()}`, {
    number: normalizePhone(phone),
    mediatype: 'document',
    mimetype: file.mime || 'application/octet-stream',
    fileName: file.filename,
    caption: (file.caption || '').slice(0, 1000),
    media: file.buffer.toString('base64'),
  })
}

/** Descarga el contenido de un audio, imagen o documento recibido. */
export async function downloadWhatsAppMedia(messageId: string): Promise<{ base64: string; mimetype: string }> {
  const data = await call<{ base64?: string; mimetype?: string }>(
    'POST',
    `/chat/getBase64FromMediaMessage/${inst()}`,
    { message: { key: { id: messageId } }, convertToMp4: false }
  )
  if (!data?.base64) throw new Error('Evolution no devolvió el archivo')
  return { base64: data.base64, mimetype: data.mimetype || 'application/octet-stream' }
}

export type EvolutionWebhook = { url?: string; enabled?: boolean; events?: string[] } | null

export async function getWhatsAppWebhook(): Promise<EvolutionWebhook> {
  return call<EvolutionWebhook>('GET', `/webhook/find/${inst()}`)
}

/** Apunta la instancia a nuestro webhook, solo con los mensajes nuevos. */
export async function setWhatsAppWebhook(url: string): Promise<void> {
  await call('POST', `/webhook/set/${inst()}`, {
    webhook: {
      enabled: true,
      url,
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT'],
    },
  })
}

export async function getWhatsAppConnectionState(): Promise<string> {
  const data = await call<{ instance?: { state?: string } }>('GET', `/instance/connectionState/${inst()}`)
  return data?.instance?.state || 'desconocido'
}
