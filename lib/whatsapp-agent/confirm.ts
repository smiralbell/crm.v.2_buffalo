import { DELETE_CONFIRM_TTL_MIN } from '@/lib/telegram-agent/config'
import { describePending, executeConfirmedPending } from '@/lib/telegram-agent/confirm'
import { advancePending, getPending, resolvePending, saveMessage, type PendingAction } from '@/lib/telegram-agent/store'
import { phoneFromChatId } from './config'
import { sendWhatsAppText } from './evolution-api'

/**
 * Doble confirmación de borrados en WhatsApp. Sin botones: el socio escribe
 *   1) BORRAR <código>  →  2) ELIMINAR DEFINITIVAMENTE <código>
 * (o CANCELAR <código>). Igual que en Telegram, cada paso avanza de forma
 * atómica en BD y el agente (LLM) nunca ejecuta el borrado: lo hace este archivo.
 */

export type WaConfirmCommand = { step: '1' | '2' | 'x'; id: string }

/** Reconoce los códigos de confirmación (mayúsculas o minúsculas, con o sin #). */
export function parseConfirmCommand(text: string): WaConfirmCommand | null {
  const t = text.trim().replace(/\s+/g, ' ')
  let m = /^eliminar definitivamente #?([a-f0-9]{10})$/i.exec(t)
  if (m) return { step: '2', id: m[1].toLowerCase() }
  m = /^borrar #?([a-f0-9]{10})$/i.exec(t)
  if (m) return { step: '1', id: m[1].toLowerCase() }
  m = /^cancelar #?([a-f0-9]{10})$/i.exec(t)
  if (m) return { step: 'x', id: m[1].toLowerCase() }
  return null
}

export async function sendWhatsAppPendingConfirmation(p: PendingAction): Promise<void> {
  await sendWhatsAppText(
    phoneFromChatId(p.chat_id),
    `${describePending(p)}\n\nPaso 1 de 2. Para eliminarlo responde exactamente:\nBORRAR ${p.id}\n\nPara no borrar nada: CANCELAR ${p.id}\nCaduca en ${DELETE_CONFIRM_TTL_MIN} min.`
  )
}

/**
 * Si el mensaje es un código de confirmación, lo aplica y contesta.
 * Devuelve true si lo ha gestionado (entonces no se pasa al agente).
 */
export async function handleWhatsAppConfirmation(
  chatId: number,
  userId: number,
  who: string,
  text: string
): Promise<boolean> {
  const cmd = parseConfirmCommand(text)
  if (!cmd) return false
  const phone = phoneFromChatId(chatId)
  const reply = (t: string) => sendWhatsAppText(phone, t)

  const pending = await getPending(cmd.id)
  if (!pending || pending.chat_id !== chatId) {
    await reply(`No hay ninguna petición de borrado ${cmd.id} en esta conversación.`)
    return true
  }

  const expired = new Date(pending.expires_at).getTime() < Date.now()
  if (pending.status !== 'pending' || expired) {
    if (pending.status === 'pending') await resolvePending(pending.id, 'expired')
    const notice: Record<string, string> = {
      done: 'Ya se eliminó.',
      executing: 'Se está eliminando.',
      failed: 'Ya se intentó y falló.',
      cancelled: 'Estaba cancelada.',
    }
    await reply(`Petición ${pending.id}: ${notice[pending.status] || 'caducada. No se ha borrado nada.'}`)
    return true
  }

  if (cmd.step === 'x') {
    await resolvePending(pending.id, 'cancelled', { by: who })
    await saveMessage(chatId, userId, 'assistant', `[Borrado #${pending.id} cancelado por ${who}]`)
    await reply(`Cancelado. No se ha borrado nada (petición ${pending.id}).`)
    return true
  }

  if (cmd.step === '1') {
    const advanced = await advancePending(pending.id, 0, 1, who)
    if (!advanced) {
      await reply(
        pending.step >= 1
          ? `Ya confirmaste el paso 1. Para eliminarlo responde: ELIMINAR DEFINITIVAMENTE ${pending.id}`
          : `No se ha podido confirmar la petición ${pending.id}.`
      )
      return true
    }
    await reply(
      `Paso 2 de 2. Confirmación final.\nEsto no se puede deshacer. Para eliminarlo responde exactamente:\nELIMINAR DEFINITIVAMENTE ${pending.id}\n\nPara no borrar nada: CANCELAR ${pending.id}`
    )
    return true
  }

  const claimed = await advancePending(pending.id, 1, 2, who, 'executing')
  if (!claimed) {
    await reply(`Primero responde BORRAR ${pending.id} (paso 1).`)
    return true
  }
  const resultLine = await executeConfirmedPending(pending, claimed, chatId, userId)
  await reply(`Petición ${pending.id}: ${resultLine}`)
  return true
}
