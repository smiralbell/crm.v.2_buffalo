import { isWhatsAppChat, phoneFromChatId } from '@/lib/whatsapp-agent/config'
import { sendWhatsAppDocument, sendWhatsAppText } from '@/lib/whatsapp-agent/evolution-api'
import { sendDocument, sendText } from './telegram-api'

/**
 * El agente habla por Telegram y por WhatsApp. Cada conversación tiene su chat_id:
 * los de WhatsApp están en un rango propio (ver WA_CHAT_OFFSET). Estas funciones
 * mandan la respuesta por el canal que toque.
 */

export type Channel = 'telegram' | 'whatsapp'

export function channelOf(chatId: number | string): Channel {
  return isWhatsAppChat(chatId) ? 'whatsapp' : 'telegram'
}

export async function sendChatText(chatId: number | string, text: string, opts?: { replyTo?: number }): Promise<void> {
  if (channelOf(chatId) === 'whatsapp') {
    await sendWhatsAppText(phoneFromChatId(chatId), text)
    return
  }
  await sendText(chatId, text, opts)
}

export async function sendChatDocument(
  chatId: number | string,
  file: { filename: string; buffer: Buffer; mime?: string; caption?: string }
): Promise<void> {
  if (channelOf(chatId) === 'whatsapp') {
    await sendWhatsAppDocument(phoneFromChatId(chatId), file)
    return
  }
  await sendDocument(chatId, file)
}
