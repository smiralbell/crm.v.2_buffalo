import { botToken } from './config'

/** Cliente mínimo de la Bot API de Telegram. */

export type InlineButton = { text: string; callback_data: string }

export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string }

export type TgChat = { id: number; type: string; title?: string }

export type TgMessage = {
  message_id: number
  from?: TgUser
  chat: TgChat
  date: number
  text?: string
  caption?: string
  voice?: { file_id: string; mime_type?: string; duration?: number }
  audio?: { file_id: string; mime_type?: string; file_name?: string }
  photo?: Array<{ file_id: string; width: number; height: number }>
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number }
  reply_to_message?: TgMessage
  entities?: Array<{ type: string; offset: number; length: number }>
}

export type TgCallbackQuery = {
  id: string
  from: TgUser
  message?: TgMessage
  data?: string
}

export type TgUpdate = {
  update_id: number
  message?: TgMessage
  edited_message?: TgMessage
  callback_query?: TgCallbackQuery
}

const MAX_TEXT = 3900

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = botToken()
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN no está configurado')
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string }
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || res.status}`)
  return data.result as T
}

/** Parte un texto largo en trozos que Telegram acepta, cortando por líneas. */
export function splitText(text: string): string[] {
  const out: string[] = []
  let rest = text.trim()
  while (rest.length > MAX_TEXT) {
    let cut = rest.lastIndexOf('\n', MAX_TEXT)
    if (cut < MAX_TEXT / 2) cut = MAX_TEXT
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

export async function sendText(
  chatId: number | string,
  text: string,
  opts?: { buttons?: InlineButton[][]; replyTo?: number }
): Promise<number | null> {
  const parts = splitText(text || '…')
  let lastId: number | null = null
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1
    const msg = await call<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text: parts[i],
      disable_web_page_preview: true,
      ...(i === 0 && opts?.replyTo ? { reply_to_message_id: opts.replyTo, allow_sending_without_reply: true } : {}),
      ...(isLast && opts?.buttons ? { reply_markup: { inline_keyboard: opts.buttons } } : {}),
    })
    lastId = msg.message_id
  }
  return lastId
}

export async function editText(
  chatId: number | string,
  messageId: number,
  text: string,
  buttons?: InlineButton[][]
): Promise<void> {
  await call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: splitText(text)[0] || '…',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons || [] },
  })
}

export async function answerCallback(id: string, text?: string): Promise<void> {
  await call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) }).catch(() => {})
}

export async function sendTyping(chatId: number | string): Promise<void> {
  await call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {})
}

export async function sendDocument(
  chatId: number | string,
  file: { filename: string; buffer: Buffer; mime?: string; caption?: string }
): Promise<void> {
  const token = botToken()
  const form = new FormData()
  form.append('chat_id', String(chatId))
  if (file.caption) form.append('caption', file.caption.slice(0, 1000))
  form.append(
    'document',
    new Blob([new Uint8Array(file.buffer)], { type: file.mime || 'application/octet-stream' }),
    file.filename
  )
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
  if (!data.ok) throw new Error(`Telegram sendDocument: ${data.description || res.status}`)
}

/** Descarga un archivo que mandó el usuario (voz, foto, documento). */
export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; path: string }> {
  const info = await call<{ file_path?: string }>('getFile', { file_id: fileId })
  if (!info.file_path) throw new Error('Telegram no devolvió la ruta del archivo')
  const res = await fetch(`https://api.telegram.org/file/bot${botToken()}/${info.file_path}`)
  if (!res.ok) throw new Error(`Descarga de Telegram ${res.status}`)
  return { buffer: Buffer.from(await res.arrayBuffer()), path: info.file_path }
}

const memberCache = new Map<string, { ok: boolean; until: number }>()

/** ¿Es miembro (no expulsado ni fuera) del grupo? Se guarda 10 minutos. */
export async function isGroupMember(groupId: string, userId: string): Promise<boolean> {
  const key = `${groupId}:${userId}`
  const hit = memberCache.get(key)
  if (hit && hit.until > Date.now()) return hit.ok
  let ok = false
  try {
    const m = await call<{ status: string; is_member?: boolean; user?: TgUser & { is_bot?: boolean } }>(
      'getChatMember',
      { chat_id: groupId, user_id: Number(userId) }
    )
    ok =
      !m.user?.is_bot &&
      (['creator', 'administrator', 'member'].includes(m.status) || (m.status === 'restricted' && m.is_member === true))
  } catch {
    ok = false
  }
  memberCache.set(key, { ok, until: Date.now() + 10 * 60_000 })
  return ok
}

let cachedMe: TgUser | null = null

export async function getMe(): Promise<TgUser> {
  if (cachedMe) return cachedMe
  cachedMe = await call<TgUser>('getMe', {})
  return cachedMe
}

export async function getWebhookInfo(): Promise<{ url?: string; pending_update_count?: number; last_error_message?: string }> {
  return call('getWebhookInfo', {})
}

export async function setWebhook(url: string, secret: string): Promise<void> {
  await call('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    max_connections: 10,
  })
}

export async function setCommands(): Promise<void> {
  await call('setMyCommands', {
    commands: [
      { command: 'ayuda', description: 'Qué puede hacer el agente' },
      { command: 'nuevo', description: 'Empezar una conversación nueva' },
      { command: 'pendientes', description: 'Borrados pendientes de confirmar' },
      { command: 'avisos', description: 'Avisos programados' },
      { command: 'instrucciones', description: 'Instrucciones guardadas del agente' },
      { command: 'id', description: 'Tu ID de Telegram' },
    ],
  }).catch(() => {})
}
