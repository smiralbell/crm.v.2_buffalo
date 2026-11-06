import { createHash, timingSafeEqual } from 'crypto'

/**
 * Configuración del agente del CRM por WhatsApp (Evolution API).
 *
 * Es el mismo agente que el de Telegram: lo único distinto es por dónde entran y
 * salen los mensajes. Cada socio tiene su conversación, identificada con un chat_id
 * numérico como en Telegram (WA_CHAT_OFFSET + su móvil), para reutilizar el
 * historial, los avisos, las instrucciones y la auditoría sin tablas nuevas.
 *
 * Variables:
 *   WHATSAPP_AGENT=1                  activar
 *   EVOLUTION_API_URL                 p. ej. https://evolution.midominio.com
 *   EVOLUTION_API_KEY                 clave global o token de la instancia
 *   EVOLUTION_INSTANCE                nombre de la instancia con el número del agente
 *   WHATSAPP_AGENT_NUMBERS            móviles de los socios, con prefijo (34600111222,34600333444)
 *   WHATSAPP_WEBHOOK_SECRET           texto largo; va en la URL del webhook
 *   WHATSAPP_AGENT_AUTO_WEBHOOK=0     no configurar el webhook en Evolution al arrancar
 */

/**
 * Los chat_id de Telegram son IDs de usuario (< 10^11) o de grupo (negativos).
 * Un móvil con prefijo tiene como mucho 15 cifras, así que 7·10^15 + móvil nunca
 * choca con Telegram y sigue siendo un entero exacto en JavaScript (< 2^53).
 */
export const WA_CHAT_OFFSET = 7_000_000_000_000_000

/** Lista separada por comas o punto y coma (no por espacios: «+34 600 111 222» es un solo número). */
function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Solo cifras: «+34 600 11 12 22» → «34600111222». */
export function normalizePhone(raw: string): string {
  return String(raw || '').replace(/\D/g, '')
}

export function evolutionBaseUrl(): string {
  return (process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '')
}

export function evolutionApiKey(): string {
  return (process.env.EVOLUTION_API_KEY || '').trim()
}

export function evolutionInstance(): string {
  return (process.env.EVOLUTION_INSTANCE || '').trim()
}

/** El agente solo responde por WhatsApp si WHATSAPP_AGENT=1 y Evolution está configurado. */
export function isWhatsAppAgentEnabled(): boolean {
  const flag = (process.env.WHATSAPP_AGENT || '').trim().toLowerCase()
  const on = flag === '1' || flag === 'true' || flag === 'on'
  return on && Boolean(evolutionBaseUrl() && evolutionApiKey() && evolutionInstance())
}

/** Móviles de los socios que pueden hablar con el agente. */
export function allowedWhatsAppNumbers(): Set<string> {
  return new Set(envList('WHATSAPP_AGENT_NUMBERS').map(normalizePhone).filter((n) => n.length >= 8))
}

export function isAllowedWhatsAppNumber(phone: string): boolean {
  const n = normalizePhone(phone)
  return Boolean(n) && allowedWhatsAppNumbers().has(n)
}

export function waChatId(phone: string): number {
  const n = normalizePhone(phone)
  if (!/^\d{8,15}$/.test(n)) throw new Error(`Número de WhatsApp no válido: ${phone}`)
  return WA_CHAT_OFFSET + Number(n)
}

export function isWhatsAppChat(chatId: number | string): boolean {
  const n = Number(chatId)
  return Number.isSafeInteger(n) && n > WA_CHAT_OFFSET && n < WA_CHAT_OFFSET + 1e15
}

/** Móvil (solo cifras) de una conversación de WhatsApp. */
export function phoneFromChatId(chatId: number | string): string {
  if (!isWhatsAppChat(chatId)) throw new Error(`No es un chat de WhatsApp: ${chatId}`)
  return String(Number(chatId) - WA_CHAT_OFFSET)
}

/**
 * Secreto que Evolution manda en la URL del webhook (?secret=…).
 * Si no hay WHATSAPP_WEBHOOK_SECRET, se deriva de la clave de Evolution.
 */
export function whatsAppWebhookSecret(): string {
  const explicit = (process.env.WHATSAPP_WEBHOOK_SECRET || '').trim()
  if (explicit) return explicit
  const key = evolutionApiKey()
  if (!key) return ''
  return createHash('sha256').update(`buffalo-wa-agent:${key}`).digest('hex').slice(0, 48)
}

export function validWhatsAppSecret(got: string): boolean {
  const expected = whatsAppWebhookSecret()
  if (!expected || got.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected))
}
