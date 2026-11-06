import { createHash } from 'crypto'

/**
 * Lee el webhook «messages.upsert» de Evolution API (v2; v1 es casi igual) y lo
 * deja en un mensaje simple. Devuelve null para todo lo que el agente ignora:
 * mensajes que envía el propio número, grupos, estados, reacciones…
 */

export type WaIncoming = {
  /** id del mensaje en WhatsApp (para descargar adjuntos y no procesarlo dos veces) */
  id: string
  /** móvil del que escribe, solo cifras */
  phone: string
  pushName: string
  text: string
  kind: 'text' | 'audio' | 'image' | 'document' | 'other'
  document?: { fileName: string; mimetype: string; size: number }
  imageMimetype?: string
}

type Obj = Record<string, unknown>

function obj(v: unknown): Obj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {}
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Un JID de persona: «34600111222@s.whatsapp.net» (o «…:12@s.whatsapp.net» con dispositivo). */
function phoneFromJid(jid: string): string {
  const m = /^(\d{8,15})(?::\d+)?@s\.whatsapp\.net$/.exec(jid)
  return m ? m[1] : ''
}

/**
 * WhatsApp está pasando a identificadores «@lid» que no son el móvil. Evolution
 * manda entonces el móvil en otro campo (remoteJidAlt / senderPn). Se usa el
 * primero que sea un número de verdad.
 */
function senderPhone(key: Obj, data: Obj): string {
  const candidates = [key.remoteJid, key.remoteJidAlt, key.senderPn, key.participantAlt, data.remoteJidAlt]
  for (const c of candidates) {
    const p = phoneFromJid(str(c))
    if (p) return p
  }
  return ''
}

/** Los mensajes «con texto» pueden venir envueltos (efímeros, vistos una vez, documento con pie…). */
function unwrap(message: Obj): Obj {
  let m = message
  for (let i = 0; i < 4; i++) {
    const inner =
      obj(m.ephemeralMessage).message ||
      obj(m.viewOnceMessage).message ||
      obj(m.viewOnceMessageV2).message ||
      obj(m.documentWithCaptionMessage).message
    if (!inner) break
    m = obj(inner)
  }
  return m
}

export function parseEvolutionWebhook(body: unknown): WaIncoming | null {
  const root = obj(body)
  const event = str(root.event).toLowerCase().replace(/_/g, '.')
  if (event && event !== 'messages.upsert') return null

  const rawData = Array.isArray(root.data) ? root.data[0] : root.data
  const data = obj(rawData)
  const key = obj(data.key)
  if (key.fromMe === true) return null

  const remoteJid = str(key.remoteJid)
  if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast') || remoteJid.endsWith('@newsletter')) {
    return null
  }

  const id = str(key.id)
  const phone = senderPhone(key, data)
  if (!id || !phone) return null

  const message = unwrap(obj(data.message))
  // Reacciones, mensajes borrados/editados, votos de encuestas y avisos internos: se ignoran
  const IGNORED = ['reactionMessage', 'protocolMessage', 'editedMessage', 'pollUpdateMessage', 'keepInChatMessage']
  if (IGNORED.some((k) => k in message)) return null
  const meaningful = Object.keys(message).filter(
    (k) => k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage'
  )
  if (meaningful.length === 0) return null
  const pushName = str(data.pushName)
  const base = { id, phone, pushName }

  const plain = str(message.conversation) || str(obj(message.extendedTextMessage).text)
  if (plain) return { ...base, text: plain.trim(), kind: 'text' }

  if (message.audioMessage) return { ...base, text: '', kind: 'audio' }

  const image = obj(message.imageMessage)
  if (message.imageMessage) {
    return { ...base, text: str(image.caption).trim(), kind: 'image', imageMimetype: str(image.mimetype) || 'image/jpeg' }
  }

  const doc = obj(message.documentMessage)
  if (message.documentMessage) {
    return {
      ...base,
      text: str(doc.caption).trim(),
      kind: 'document',
      document: {
        fileName: str(doc.fileName) || str(doc.title) || 'archivo',
        mimetype: str(doc.mimetype),
        size: Number(doc.fileLength) || 0,
      },
    }
  }

  return { ...base, text: '', kind: 'other' }
}

/**
 * Número para no procesar dos veces el mismo mensaje en telegram_agent_updates
 * (BIGINT). Los update_id de Telegram son < 2^32; estos van de 4·10^15 en adelante.
 */
export function waUpdateId(messageId: string): number {
  const hex = createHash('sha256').update(`wa:${messageId}`).digest('hex').slice(0, 12)
  return 4_000_000_000_000_000 + parseInt(hex, 16)
}
