import { createHash } from 'crypto'

/**
 * Configuración del agente de Telegram.
 *
 * Quién puede hablar con el agente: los mismos IDs que ya reciben los avisos
 * del CRM (TELEGRAM_CHAT_IDS / TELEGRAM_CHAT_ID). Los IDs positivos son
 * personas (chat privado = ID de usuario); los negativos, grupos.
 * TELEGRAM_AGENT_USER_IDS añade personas extra (p. ej. si los avisos van a un grupo).
 */

function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function alertChatIds(): string[] {
  const many = envList('TELEGRAM_CHAT_IDS')
  return many.length ? many : envList('TELEGRAM_CHAT_ID')
}

export function botToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || ''
}

/** El agente solo responde si TELEGRAM_AGENT=1 (los avisos siguen funcionando igual). */
export function isAgentEnabled(): boolean {
  const flag = (process.env.TELEGRAM_AGENT || '').trim().toLowerCase()
  return Boolean(botToken()) && (flag === '1' || flag === 'true' || flag === 'on')
}

/** IDs de usuario con permiso total por configuración (chats privados de avisos + extra). */
export function allowedUserIds(): Set<string> {
  const ids = alertChatIds()
    .filter((id) => /^\d+$/.test(id))
    .concat(envList('TELEGRAM_AGENT_USER_IDS').filter((id) => /^\d+$/.test(id)))
  return new Set(ids)
}

/** Grupos de avisos: sus miembros son los socios y el agente también contesta ahí. */
export function allowedGroupIds(): Set<string> {
  return new Set(alertChatIds().filter((id) => /^-\d+$/.test(id)))
}

/** ¿Este chat es uno donde el agente puede contestar a ese usuario? */
function chatAllowed(userId: string, chatId: string, chatType: string): boolean {
  if (chatType === 'private') return chatId === userId
  return allowedGroupIds().has(chatId)
}

/**
 * Socio = quien recibe los avisos: su chat privado está en TELEGRAM_CHAT_IDS, está en
 * TELEGRAM_AGENT_USER_IDS, o es miembro de un grupo de avisos (se pregunta a Telegram).
 */
export async function isAuthorized(
  userId: number | string,
  chatId: number | string,
  chatType: string,
  isGroupMember: (groupId: string, userId: string) => Promise<boolean>
): Promise<boolean> {
  const uid = String(userId)
  if (!chatAllowed(uid, String(chatId), chatType)) return false
  if (allowedUserIds().has(uid)) return true
  const groups = Array.from(allowedGroupIds())
  for (const g of groups) {
    if (await isGroupMember(g, uid)) return true
  }
  return false
}

/** Secreto que Telegram manda en cada webhook (X-Telegram-Bot-Api-Secret-Token). */
export function webhookSecret(): string {
  const explicit = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  if (explicit) return explicit
  const token = botToken()
  if (!token) return ''
  return createHash('sha256').update(`buffalo-tg-agent:${token}`).digest('hex').slice(0, 48)
}

export function agentModel(): string {
  return (
    process.env.TELEGRAM_AGENT_MODEL ||
    process.env.OPENROUTER_MODEL_HEAVY ||
    '~anthropic/claude-sonnet-latest'
  )
}

export function subagentModel(): string {
  return process.env.TELEGRAM_SUBAGENT_MODEL || agentModel()
}

export const FALLBACK_MODEL = 'openai/gpt-4o-mini'

/** Minutos que vale una petición de borrado antes de caducar. */
export const DELETE_CONFIRM_TTL_MIN = 15
