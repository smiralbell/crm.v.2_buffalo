import { openRouterDescribeImage, openRouterTranscribeAudio } from '@/lib/openrouter'
import { runAgent } from '@/lib/telegram-agent/agent'
import { sendPendingConfirmation } from '@/lib/telegram-agent/confirm'
import { deliver } from '@/lib/telegram-agent/handler'
import { claimUpdate, listOpenPending, loadHistory, saveMessage } from '@/lib/telegram-agent/store'
import type { AgentContext } from '@/lib/telegram-agent/tools'
import { isAllowedWhatsAppNumber, isWhatsAppAgentEnabled, waChatId } from './config'
import { handleWhatsAppConfirmation } from './confirm'
import { downloadWhatsAppMedia, sendWhatsAppText, sendWhatsAppTyping } from './evolution-api'
import { parseEvolutionWebhook, waUpdateId, type WaIncoming } from './payload'

/** Una petición a la vez por conversación, en orden de llegada. */
const chatQueues = new Map<number, Promise<void>>()

function enqueue(chatId: number, job: () => Promise<void>): Promise<void> {
  const prev = chatQueues.get(chatId) || Promise.resolve()
  const next = prev.then(job, job).finally(() => {
    if (chatQueues.get(chatId) === next) chatQueues.delete(chatId)
  })
  chatQueues.set(chatId, next)
  return next
}

/** Punto de entrada del webhook de Evolution. */
export async function handleWhatsAppWebhook(body: unknown): Promise<void> {
  if (!isWhatsAppAgentEnabled()) return
  const msg = parseEvolutionWebhook(body)
  if (!msg) return

  // Solo los socios. Al resto no se le contesta (es un número de WhatsApp normal).
  if (!isAllowedWhatsAppNumber(msg.phone)) {
    console.warn(`[whatsapp-agent] mensaje ignorado de un número no autorizado (…${msg.phone.slice(-4)})`)
    return
  }
  if (!(await claimUpdate(waUpdateId(msg.id)))) return

  const chatId = waChatId(msg.phone)
  await enqueue(chatId, () => processMessage(chatId, msg))
}

const HELP = `Soy el agente del CRM de Buffalo, el mismo que en Telegram. Escríbeme o mándame una nota de voz.

Puedo consultar y cambiar cualquier cosa del CRM, programar avisos, guardar instrucciones y mandarte exportaciones en CSV.

Para borrar algo siempre te pediré confirmarlo dos veces escribiendo un código.

Comandos: /nuevo (conversación nueva) · /pendientes (borrados por confirmar) · /ayuda`

async function processMessage(chatId: number, msg: WaIncoming): Promise<void> {
  const userId = Number(msg.phone)
  const userName = msg.pushName.trim() || 'socio'
  const raw = msg.text.trim()

  if (raw.startsWith('/') && (await handleCommand(chatId, userId, raw))) return
  if (raw && (await handleWhatsAppConfirmation(chatId, userId, userName, raw))) return
  // Stickers, ubicaciones, contactos, reacciones…: no se pasan a la IA
  if (msg.kind === 'other' && !raw) {
    await sendWhatsAppText(msg.phone, 'Solo puedo leer texto, notas de voz, fotos y archivos de texto (csv, txt, json).')
    return
  }

  const typing = setInterval(() => void sendWhatsAppTyping(msg.phone), 5000)
  void sendWhatsAppTyping(msg.phone)
  try {
    const userText = await buildUserText(msg)
    if (!userText) return

    const history = await loadHistory(chatId)
    await saveMessage(chatId, userId, 'user', `${userName}: ${userText}`)

    const ctx: AgentContext = { chatId, userId, userName, pending: [], documents: [], actions: [] }
    let reply: string
    try {
      reply = await runAgent(ctx, history, `${userName}: ${userText}`)
    } catch (e) {
      console.error('[whatsapp-agent]', e)
      const detail = e instanceof Error ? e.message : String(e)
      reply = /OpenRouter 402/.test(detail)
        ? 'No puedo responder ahora: la cuenta de OpenRouter se ha quedado sin saldo. Recargad en openrouter.ai/settings/credits.'
        : `Ha fallado algo: ${detail}`
    }
    await deliver(ctx, reply)
  } finally {
    clearInterval(typing)
  }
}

async function handleCommand(chatId: number, userId: number, raw: string): Promise<boolean> {
  const phone = String(userId)
  const cmd = raw.split(/\s/)[0].toLowerCase()
  switch (cmd) {
    case '/start':
    case '/ayuda':
    case '/help':
      await sendWhatsAppText(phone, HELP)
      return true
    case '/nuevo':
    case '/reset':
      await saveMessage(chatId, userId, 'reset', '')
      await sendWhatsAppText(phone, 'Conversación nueva. Las instrucciones y avisos guardados se mantienen.')
      return true
    case '/pendientes': {
      const list = await listOpenPending(chatId)
      if (!list.length) await sendWhatsAppText(phone, 'No hay borrados pendientes de confirmar.')
      for (const p of list) await sendPendingConfirmation(p)
      return true
    }
    default:
      return false
  }
}

function audioFormat(mimetype: string): string {
  const sub = (mimetype.split(';')[0].split('/')[1] || 'ogg').toLowerCase()
  if (sub === 'mpeg') return 'mp3'
  if (sub === 'mp4' || sub === 'x-m4a') return 'm4a'
  return sub === 'oga' ? 'ogg' : sub
}

/** Texto para el agente: el mensaje, la nota de voz transcrita, la foto descrita o el archivo leído. */
async function buildUserText(msg: WaIncoming): Promise<string> {
  const parts: string[] = []
  const caption = msg.text

  if (msg.kind === 'audio') {
    try {
      const media = await downloadWhatsAppMedia(msg.id)
      parts.push(`(nota de voz) ${await openRouterTranscribeAudio(media.base64, audioFormat(media.mimetype))}`)
    } catch (e) {
      parts.push(`(nota de voz que no se pudo transcribir: ${e instanceof Error ? e.message : e})`)
    }
  }

  if (msg.kind === 'image') {
    try {
      const media = await downloadWhatsAppMedia(msg.id)
      const description = await openRouterDescribeImage(media.base64, msg.imageMimetype || media.mimetype, caption)
      parts.push(`(imagen adjunta, contenido: ${description})`)
    } catch (e) {
      parts.push(`(imagen que no se pudo leer: ${e instanceof Error ? e.message : e})`)
    }
  }

  if (msg.kind === 'document' && msg.document) {
    const name = msg.document.fileName
    const textLike = /\.(txt|csv|md|json|tsv|html?|xml|log)$/i.test(name) || /^text\//.test(msg.document.mimetype)
    if (textLike && msg.document.size < 2_000_000) {
      try {
        const media = await downloadWhatsAppMedia(msg.id)
        parts.push(`(archivo adjunto ${name}):\n${Buffer.from(media.base64, 'base64').toString('utf8').slice(0, 60_000)}`)
      } catch (e) {
        parts.push(`(archivo ${name} que no se pudo descargar: ${e instanceof Error ? e.message : e})`)
      }
    } else {
      parts.push(`(archivo adjunto ${name}: este tipo de archivo no lo puedo leer, solo texto/csv/json)`)
    }
  }

  if (caption) parts.unshift(caption)
  return parts.join('\n\n').trim()
}
