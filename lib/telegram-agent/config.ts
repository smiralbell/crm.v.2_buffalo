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

/** IDs de usuario de los socios con permiso total. */
export function allowedUserIds(): Set<string> {
  const ids = alertChatIds()
    .filter((id) => /^\d+$/.test(id))
    .concat(envList('TELEGRAM_AGENT_USER_IDS').filter((id) => /^\d+$/.test(id)))
  return new Set(ids)
}

/** Grupos en los que el agente puede contestar (los de los avisos). */
export function allowedGroupIds(): Set<string> {
  return new Set(alertChatIds().filter((id) => /^-\d+$/.test(id)))
}

export function isAuthorized(userId: number | string, chatId: number | string, chatType: string): boolean {
  if (!allowedUserIds().has(String(userId))) return false
  if (chatType === 'private') return String(chatId) === String(userId)
  return allowedGroupIds().has(String(chatId))
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
