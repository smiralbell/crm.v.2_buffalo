import { createHash, timingSafeEqual } from 'crypto'
import { crmPublicBaseUrl } from '@/lib/ops-alerts'
import { evolutionApiKey, evolutionBaseUrl, normalizePhone } from '@/lib/whatsapp-agent/config'
import { evolutionRequest } from '@/lib/whatsapp-agent/evolution-api'
import { senderPhone } from '@/lib/whatsapp-agent/payload'
import { isPublicWebhookUrl } from '@/lib/whatsapp-agent/setup'
import { findMediaInMessage, unwrapWhatsAppMessage, type DemoMediaKind } from './media'

/**
 * WhatsApp de las demos por Evolution API.
 *
 * Va en su propia instancia (otro número), no en la del agente del CRM: a este
 * número escriben los prospectos y contesta el agente de su demo.
 *
 * Variables:
 *   EVOLUTION_API_URL           el mismo servidor que el agente del CRM
 *   EVOLUTION_DEMOS_INSTANCE    nombre de la instancia con el número de las demos
 *   EVOLUTION_DEMOS_API_KEY     opcional: token de esa instancia (si no, EVOLUTION_API_KEY)
 *   DEMOS_WEBHOOK_SECRET        opcional: va en la URL del webhook (si no, se deriva de la clave)
 */

export type { DemoMediaKind }

export function demosInstance(): string {
  return (process.env.EVOLUTION_DEMOS_INSTANCE || '').trim()
}

export function demosApiKey(): string {
  return (process.env.EVOLUTION_DEMOS_API_KEY || '').trim() || evolutionApiKey()
}

export function isDemosWhatsAppConfigured(): boolean {
  return Boolean(evolutionBaseUrl() && demosApiKey() && demosInstance())
}

function inst(): string {
  const name = demosInstance()
  if (!name) throw new Error('Falta EVOLUTION_DEMOS_INSTANCE')
  return encodeURIComponent(name)
}

function call<T = unknown>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  return evolutionRequest<T>(method, path, body, demosApiKey())
}

// ── Webhook ──────────────────────────────────────────────────────────────────

export function demosWebhookSecret(): string {
  const explicit = (process.env.DEMOS_WEBHOOK_SECRET || '').trim()
  if (explicit) return explicit
  const key = demosApiKey()
  if (!key) return ''
  return createHash('sha256').update(`buffalo-wa-demos:${key}:${demosInstance()}`).digest('hex').slice(0, 48)
}

export function validDemosWebhookSecret(got: string): boolean {
  const expected = demosWebhookSecret()
  if (!expected || got.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected))
}

export function demosWebhookUrl(): string {
  return `${crmPublicBaseUrl()}/api/demos/webhook?secret=${encodeURIComponent(demosWebhookSecret())}`
}

type EvolutionWebhook = { url?: string; enabled?: boolean; events?: string[] } | null

/** Apunta la instancia de las demos a nuestro webhook si no lo está ya. */
export async function ensureDemosWebhook(force = false): Promise<{ url: string; changed: boolean }> {
  const url = demosWebhookUrl()
  if (!isPublicWebhookUrl(url)) {
    throw new Error(`No se configura el webhook: ${new URL(url).origin} no es una dirección pública con https`)
  }
  const current = await call<EvolutionWebhook>('GET', `/webhook/find/${inst()}`).catch(() => null)
  const ok =
    current?.enabled !== false &&
    current?.url === url &&
    (current?.events || []).some((e) => e.toUpperCase().replace(/\./g, '_') === 'MESSAGES_UPSERT')
  if (!force && ok) return { url, changed: false }
  await call('POST', `/webhook/set/${inst()}`, {
    webhook: { enabled: true, url, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] },
  })
  return { url, changed: true }
}

declare global {
  // eslint-disable-next-line no-var
  var __buffaloDemosWhatsApp: boolean | undefined
}

/** Una vez por proceso: deja el webhook de las demos configurado en Evolution. */
export function startDemosWhatsApp(): void {
  if (globalThis.__buffaloDemosWhatsApp || !isDemosWhatsAppConfigured()) return
  globalThis.__buffaloDemosWhatsApp = true
  void ensureDemosWebhook()
    .then((r) => r.changed && console.log('[demos] webhook configurado en Evolution'))
    .catch((e) => console.warn('[demos] webhook', e instanceof Error ? e.message : e))
}

// ── Mensajes entrantes ───────────────────────────────────────────────────────

export interface ParsedDemoMessage {
  messageId: string | null
  /** Móvil del que escribe, solo cifras */
  senderPhone: string
  text: string
  event: string | null
  mediaType: DemoMediaKind | 'text'
  hasMedia: boolean
  mediaReadable: boolean
  mediaCaption: string
}

export type ParseDemoResult =
  | { ok: true; data: ParsedDemoMessage }
  | { ok: false; reason: string; reason_code: string; event?: string | null; debug?: Record<string, unknown> }

type Obj = Record<string, unknown>

function obj(v: unknown): Obj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {}
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

const IGNORED_KEYS = ['reactionMessage', 'protocolMessage', 'editedMessage', 'pollUpdateMessage', 'keepInChatMessage']

/** Lee el «messages.upsert» de Evolution (v2). */
export function parseDemoWebhook(body: unknown): ParseDemoResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'Body vacío o no JSON', reason_code: 'empty_body' }
  }
  const root = body as Obj
  const event = str(root.event) || null
  const normalized = (event || '').toLowerCase().replace(/_/g, '.')
  if (normalized && normalized !== 'messages.upsert') {
    return { ok: false, reason: `Evento ignorado: ${event}`, reason_code: 'event_ignored', event }
  }

  const data = obj(Array.isArray(root.data) ? root.data[0] : root.data)
  const key = obj(data.key)
  if (key.fromMe === true) {
    return { ok: false, reason: 'Mensaje saliente (fromMe), ignorado', reason_code: 'from_me', event }
  }

  const remoteJid = str(key.remoteJid)
  if (!remoteJid || /@(g\.us|broadcast|newsletter)$/.test(remoteJid)) {
    return { ok: false, reason: 'No es un chat privado', reason_code: 'not_private_chat', event }
  }

  const phone = senderPhone(key, data)
  if (!phone) {
    return {
      ok: false,
      reason: 'Sin teléfono del remitente',
      reason_code: 'no_sender',
      event,
      debug: { key_fields: Object.keys(key) },
    }
  }

  const message = unwrapWhatsAppMessage(obj(data.message)) || {}
  if (IGNORED_KEYS.some((k) => k in message)) {
    return { ok: false, reason: 'Reacción, edición o aviso interno', reason_code: 'no_content', event }
  }

  const media = findMediaInMessage(message)
  const mediaCaption = media?.caption ?? ''
  const text =
    str(message.conversation).trim() || str(obj(message.extendedTextMessage).text).trim() || mediaCaption

  if (!text && !media) {
    return {
      ok: false,
      reason: 'Mensaje sin texto ni multimedia soportada',
      reason_code: 'no_content',
      event,
      debug: { message_keys: Object.keys(message) },
    }
  }

  return {
    ok: true,
    data: {
      messageId: str(key.id) || null,
      senderPhone: phone,
      text,
      event,
      mediaType: media?.kind ?? 'text',
      hasMedia: media !== null,
      mediaReadable: media?.readable ?? false,
      mediaCaption,
    },
  }
}

/** Descarga un audio o una imagen recibidos. */
export async function downloadDemoMedia(messageId: string): Promise<{ base64: string; mimetype: string }> {
  const data = await call<{ base64?: string; mimetype?: string }>(
    'POST',
    `/chat/getBase64FromMediaMessage/${inst()}`,
    { message: { key: { id: messageId } }, convertToMp4: false }
  )
  if (!data?.base64) throw new Error('Evolution no devolvió el archivo')
  return { base64: data.base64, mimetype: data.mimetype || 'application/octet-stream' }
}

// ── Mensajes salientes ───────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Lo que tardaría una persona en escribirlo */
export function typingDelayMs(text: string): number {
  return Math.min(9000, Math.max(1500, 1200 + text.length * 35))
}

/** Evolution enseña «escribiendo…» durante `delay` y luego manda el texto. */
export async function sendDemoText(phone: string, text: string, typingMs = 0): Promise<void> {
  await call('POST', `/message/sendText/${inst()}`, {
    number: normalizePhone(phone),
    text,
    delay: Math.round(typingMs),
    linkPreview: false,
  })
}

/** Varios mensajes seguidos, cada uno con su «escribiendo…» y una pausa natural. */
export async function sendDemoMessageSequence(phone: string, messages: string[]): Promise<void> {
  for (let i = 0; i < messages.length; i++) {
    await sendDemoText(phone, messages[i], typingDelayMs(messages[i]))
    if (i < messages.length - 1) await sleep(randomBetween(600, 1400))
  }
}

/** Imagen o documento: `media` es una URL pública o el archivo en base64. */
export async function sendDemoMedia(
  phone: string,
  file: { kind: 'image' | 'document'; media: string; filename: string; mime: string; caption?: string }
): Promise<void> {
  await call('POST', `/message/sendMedia/${inst()}`, {
    number: normalizePhone(phone),
    mediatype: file.kind,
    mimetype: file.mime || 'application/octet-stream',
    fileName: file.filename,
    caption: (file.caption || '').slice(0, 1000),
    media: file.media,
  })
}
