import { openRouterDescribeImage, openRouterTranscribeAudio } from '@/lib/openrouter'
import { runAgent } from './agent'
import { isAgentEnabled, isAuthorized } from './config'
import { handleDeleteCallback, sendPendingConfirmation } from './confirm'
import { AGENT_MODULES } from './modules'
import {
  claimUpdate,
  listInstructions,
  listOpenPending,
  listReminders,
  loadHistory,
  saveMessage,
} from './store'
import {
  answerCallback,
  downloadFile,
  getMe,
  isGroupMember,
  sendDocument,
  sendText,
  sendTyping,
  type TgMessage,
  type TgUpdate,
} from './telegram-api'
import type { AgentContext } from './tools'

/** Una petición a la vez por chat, en orden de llegada. */
const chatQueues = new Map<number, Promise<void>>()

function enqueue(chatId: number, job: () => Promise<void>): Promise<void> {
  const prev = chatQueues.get(chatId) || Promise.resolve()
  const next = prev.then(job, job).finally(() => {
    if (chatQueues.get(chatId) === next) chatQueues.delete(chatId)
  })
  chatQueues.set(chatId, next)
  return next
}

export async function handleTelegramUpdate(update: TgUpdate): Promise<void> {
  if (!isAgentEnabled()) return
  if (!(await claimUpdate(update.update_id))) return

  const cb = update.callback_query
  if (cb) {
    const chat = cb.message?.chat
    if (!chat || !(await isAuthorized(cb.from.id, chat.id, chat.type, isGroupMember))) {
      await answerCallback(cb.id, 'No autorizado')
      return
    }
    if ((cb.data || '').startsWith('del:')) await handleDeleteCallback(cb)
    else await answerCallback(cb.id)
    return
  }

  const msg = update.message
  if (!msg?.from) return
  if (!(await isAuthorized(msg.from.id, msg.chat.id, msg.chat.type, isGroupMember))) {
    if (msg.chat.type === 'private') {
      await sendText(msg.chat.id, `⛔ No tienes acceso a este agente. Tu ID de Telegram es ${msg.from.id}.`)
    }
    console.warn(`[telegram-agent] mensaje no autorizado de ${msg.from.id} en chat ${msg.chat.id}`)
    return
  }
  if (msg.chat.type !== 'private' && !(await addressedToBot(msg))) return

  await enqueue(msg.chat.id, () => processMessage(msg))
}

/** En grupos solo contesta si le mencionan, le responden o es un comando. */
async function addressedToBot(msg: TgMessage): Promise<boolean> {
  const text = msg.text || msg.caption || ''
  if (text.startsWith('/')) return true
  const me = await getMe().catch(() => null)
  if (!me) return false
  if (msg.reply_to_message?.from?.id === me.id) return true
  return Boolean(me.username && text.toLowerCase().includes(`@${me.username.toLowerCase()}`))
}

async function processMessage(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id
  const from = msg.from!
  const userName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'socio'

  const raw = (msg.text || '').trim()
  if (raw.startsWith('/')) {
    const handled = await handleCommand(raw, msg)
    if (handled) return
  }

  const typing = setInterval(() => void sendTyping(chatId), 4500)
  void sendTyping(chatId)
  try {
    const userText = await buildUserText(msg)
    if (!userText) return

    const history = await loadHistory(chatId)
    await saveMessage(chatId, from.id, 'user', `${userName}: ${userText}`)

    const ctx: AgentContext = { chatId, userId: from.id, userName, pending: [], documents: [], actions: [] }
    let reply: string
    try {
      reply = await runAgent(ctx, history, `${userName}: ${userText}`)
    } catch (e) {
      console.error('[telegram-agent]', e)
      const detail = e instanceof Error ? e.message : String(e)
      reply = /OpenRouter 402/.test(detail)
        ? '❌ No puedo pensar ahora: la cuenta de OpenRouter se ha quedado sin saldo. Recargad en openrouter.ai/settings/credits.'
        : `❌ Error del agente: ${detail}`
    }

    await deliver(ctx, reply, msg.message_id)
  } finally {
    clearInterval(typing)
  }
}

/** Envía respuesta, adjuntos y confirmaciones de borrado; guarda el historial. */
export async function deliver(ctx: AgentContext, reply: string, replyTo?: number): Promise<void> {
  await sendText(ctx.chatId, reply, { replyTo })
  for (const doc of ctx.documents) {
    await sendDocument(ctx.chatId, doc).catch(async (e) => {
      await sendText(ctx.chatId, `No he podido adjuntar ${doc.filename}: ${e instanceof Error ? e.message : e}`)
    })
  }
  for (const p of ctx.pending) await sendPendingConfirmation(p)

  const notes = [
    ctx.actions.length ? `[acciones: ${ctx.actions.join(', ')}]` : '',
    ctx.pending.length ? `[borrados pendientes de botones: ${ctx.pending.map((p) => `#${p.id}`).join(', ')}]` : '',
  ].filter(Boolean)
  await saveMessage(ctx.chatId, null, 'assistant', [reply, ...notes].join('\n'))
}

/** Texto para el agente: el mensaje, la nota de voz transcrita, la foto descrita o el archivo leído. */
async function buildUserText(msg: TgMessage): Promise<string> {
  const parts: string[] = []
  const caption = (msg.text || msg.caption || '').trim()

  const voice = msg.voice || msg.audio
  if (voice) {
    try {
      const { buffer, path } = await downloadFile(voice.file_id)
      const ext = (path.split('.').pop() || 'ogg').toLowerCase()
      const transcript = await openRouterTranscribeAudio(buffer.toString('base64'), ext === 'oga' ? 'ogg' : ext)
      parts.push(`(nota de voz) ${transcript}`)
    } catch (e) {
      parts.push(`(nota de voz que no se pudo transcribir: ${e instanceof Error ? e.message : e})`)
    }
  }

  if (msg.photo?.length) {
    try {
      const best = msg.photo[msg.photo.length - 1]
      const { buffer } = await downloadFile(best.file_id)
      const description = await openRouterDescribeImage(buffer.toString('base64'), 'image/jpeg', caption)
      parts.push(`(imagen adjunta, contenido: ${description})`)
    } catch (e) {
      parts.push(`(imagen que no se pudo leer: ${e instanceof Error ? e.message : e})`)
    }
  }

  if (msg.document) {
    const name = msg.document.file_name || 'archivo'
    const textLike = /\.(txt|csv|md|json|tsv|html?|xml|log)$/i.test(name) || /^text\//.test(msg.document.mime_type || '')
    if (textLike && (msg.document.file_size || 0) < 2_000_000) {
      try {
        const { buffer } = await downloadFile(msg.document.file_id)
        parts.push(`(archivo adjunto ${name}):\n${buffer.toString('utf8').slice(0, 60_000)}`)
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

const HELP = `Soy el agente del CRM de Buffalo. Tenéis acceso total: escribidme o mandadme una nota de voz.

Qué puedo hacer:
- Consultar cualquier dato: leads, proyectos, finanzas, banco, tickets, marketing, cold calling…
- Crear y cambiar lo que sea: leads, notas, estados, tareas, tickets, checklist, reuniones, emails, configuraciones.
- Trabajar con subagentes especialistas en paralelo: ${AGENT_MODULES.map((m) => m.key).join(', ')}.
- Programar avisos («cada lunes a las 9 mándame los cobros pendientes»).
- Guardar instrucciones permanentes («a partir de ahora…»).
- Adjuntar exportaciones en CSV o texto.

Borrar algo siempre pide doble confirmación con botones.

Comandos: /nuevo (conversación nueva) · /pendientes · /avisos · /instrucciones · /id`

async function handleCommand(raw: string, msg: TgMessage): Promise<boolean> {
  const chatId = msg.chat.id
  const cmd = raw.split(/[\s@]/)[0].toLowerCase()
  switch (cmd) {
    case '/start':
    case '/ayuda':
    case '/help':
      await sendText(chatId, HELP)
      return true
    case '/nuevo':
    case '/reset':
      await saveMessage(chatId, msg.from!.id, 'reset', '')
      await sendText(chatId, '🧹 Conversación nueva. Las instrucciones y avisos guardados se mantienen.')
      return true
    case '/id':
      await sendText(chatId, `Tu ID: ${msg.from!.id}\nEste chat: ${chatId}`)
      return true
    case '/pendientes': {
      const list = await listOpenPending(chatId)
      if (!list.length) {
        await sendText(chatId, 'No hay borrados pendientes de confirmar.')
        return true
      }
      for (const p of list) await sendPendingConfirmation(p)
      return true
    }
    case '/avisos': {
      const list = await listReminders()
      await sendText(
        chatId,
        list.length
          ? `⏰ Avisos programados:\n\n${list
              .map(
                (r) =>
                  `#${r.id} · ${new Date(r.next_run_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} · ${r.repetir} · ${r.tipo === 'tarea' ? '🤖 ' : ''}${r.texto}`
              )
              .join('\n')}`
          : 'No hay avisos programados. Pídemelos, p. ej. «recuérdame mañana a las 10 llamar a Juan».'
      )
      return true
    }
    case '/instrucciones': {
      const list = await listInstructions()
      await sendText(
        chatId,
        list.length
          ? `📌 Instrucciones guardadas:\n\n${list.map((i) => `#${i.id}${i.modulo ? ` [${i.modulo}]` : ''} ${i.texto}`).join('\n')}`
          : 'No hay instrucciones guardadas. Dime «a partir de ahora…» y la guardo.'
      )
      return true
    }
    default:
      return false
  }
}
