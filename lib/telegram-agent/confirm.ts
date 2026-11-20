import { DELETE_CONFIRM_TTL_MIN } from './config'
import { executeDeleteRows, executeDestructiveSql, type DeleteRowsPayload } from './db-tools'
import {
  advancePending,
  audit,
  getPending,
  listFreshPending,
  resolvePending,
  saveMessage,
  setPendingMessage,
  type PendingAction,
} from './store'
import { answerCallback, editText, sendText, type TgCallbackQuery } from './telegram-api'
import { recordUndo, type UndoStep } from './undo'
import { isWhatsAppChat } from '@/lib/whatsapp-agent/config'
import { sendWhatsAppPendingConfirmation } from '@/lib/whatsapp-agent/confirm'

/**
 * Confirmación de borrados. El agente (LLM) nunca borra: solo crea una petición
 * pendiente. El borrado lo ejecuta este archivo cuando la persona confirma:
 *  - borrar filas: un paso («ok» en el chat o el botón «Sí, borrar»). Se puede deshacer.
 *  - SQL destructivo (DROP, TRUNCATE…): dos pasos, porque no se puede deshacer.
 * Cada paso avanza de forma atómica en BD: solo una confirmación gana.
 */

/** ¿Este borrado se confirma en un solo paso? (los de filas, que se pueden deshacer) */
export function isOneStep(p: Pick<PendingAction, 'kind'>): boolean {
  return p.kind === 'delete_rows'
}

const AFFIRM = /^(ok|okay|okey|vale|s[ií]|confirmo|confirmado|adelante|dale|hazlo|b[oó]rralo|b[oó]rralos|s[ií],? b[oó]rralo)$/i
const DENY = /^(no|cancela|cancelar|d[eé]jalo|no lo borres|mejor no)$/i

/** «ok», «vale», «sí»… (o «ok <código>»), «no», «cancela»… Devuelve null si no es eso. */
export function parseQuickReply(text: string): { answer: 'yes' | 'no'; id: string | null } | null {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.!¡¿?\s]+$/g, '')
    .replace(/^[¡¿\s]+/, '')
    .replace(/\s+/g, ' ')
  const m = /^(.*?)(?: #?([a-f0-9]{10}))?$/.exec(t)
  const word = (m?.[1] ?? t).trim()
  const id = m?.[2] ?? null
  if (AFFIRM.test(word)) return { answer: 'yes', id }
  if (DENY.test(word)) return { answer: 'no', id }
  return null
}

/**
 * Respuesta rápida a los borrados que el agente ACABA de pedir. Devuelve el texto
 * para contestar, o null si no había nada que confirmar (entonces el mensaje va a la IA).
 */
export async function confirmFreshByText(
  chatId: number,
  userId: number | null,
  who: string,
  text: string
): Promise<string | null> {
  const quick = parseQuickReply(text)
  if (!quick) return null
  const fresh = (await listFreshPending(chatId)).filter((p) => !quick.id || p.id === quick.id)
  if (!fresh.length) return null
  await saveMessage(chatId, userId, 'user', `${who}: ${text.trim()}`)

  if (quick.answer === 'no') {
    for (const p of fresh) await resolvePending(p.id, 'cancelled', { by: who })
    const line = fresh.length === 1 ? 'Cancelado. No he borrado nada.' : `Cancelados los ${fresh.length} borrados. No he borrado nada.`
    await saveMessage(chatId, null, 'assistant', line)
    return line
  }

  const lines: string[] = []
  for (const p of fresh) {
    if (!isOneStep(p)) {
      // SQL destructivo: no se puede deshacer, así que el «ok» solo cuenta como primer paso
      if (isWhatsAppChat(chatId)) {
        await advancePending(p.id, 0, 1, who)
        lines.push(`${p.summary}: esto no se puede deshacer. Para hacerlo, responde exactamente: ELIMINAR DEFINITIVAMENTE ${p.id}`)
      } else {
        lines.push(`${p.summary}: esto no se puede deshacer. Confírmalo con los botones del mensaje.`)
      }
      continue
    }
    const claimed = await advancePending(p.id, 0, 2, who, 'executing')
    if (!claimed) continue
    const result = await executeConfirmedPending(p, claimed, chatId, userId)
    lines.push(fresh.length === 1 ? result : `${p.summary}: ${result}`)
  }
  return lines.join('\n') || 'Ya estaba resuelto.'
}

function describe(p: PendingAction): string {
  const lines = [`Petición de borrado #${p.id}`, '', p.summary]
  const prev = p.preview || {}
  if (p.kind === 'delete_rows') {
    lines.push('', `Tabla: ${String(prev.tabla)} · ${Number(prev.filas)} fila(s)`)
    const sample = Array.isArray(prev.muestra) ? (prev.muestra as Record<string, unknown>[]) : []
    for (const row of sample.slice(0, 5)) lines.push(`- ${rowLabel(row)}`)
    if (Number(prev.filas) > sample.length) lines.push(`- … y ${Number(prev.filas) - sample.length} más`)
  } else {
    lines.push('', `SQL: ${String(prev.sql || '').slice(0, 1500)}`)
  }
  return lines.join('\n')
}

/** Una línea legible por fila: id + los primeros campos con texto. */
function rowLabel(row: Record<string, unknown>): string {
  const preferred = ['nombre', 'name', 'title', 'titulo', 'texto', 'empresa', 'email', 'subject', 'invoice_number', 'status', 'estado']
  const parts: string[] = []
  if (row.id != null) parts.push(`#${String(row.id)}`)
  for (const k of preferred) {
    if (row[k] != null && String(row[k]).trim() && parts.length < 4) parts.push(String(row[k]).slice(0, 60))
  }
  if (parts.length < 2) {
    for (const k of Object.keys(row)) {
      if (k === 'id' || parts.length >= 4) continue
      const v = row[k]
      if (v != null && typeof v !== 'object' && String(v).trim()) parts.push(`${k}=${String(v).slice(0, 40)}`)
    }
  }
  return parts.join(' · ')
}

export { describe as describePending }

/**
 * Ejecuta un borrado que ya pasó los dos pasos (claimed = estado «executing»),
 * lo audita y lo apunta en el historial. Lo usan Telegram (botones) y WhatsApp (códigos).
 */
export async function executeConfirmedPending(
  pending: PendingAction,
  claimed: PendingAction,
  chatId: number,
  userId: number | null
): Promise<string> {
  let outcome: Record<string, unknown>
  let ok = true
  try {
    outcome =
      pending.kind === 'delete_rows'
        ? await executeDeleteRows(pending.payload as unknown as DeleteRowsPayload)
        : await executeDestructiveSql(
            String(pending.payload.sql || ''),
            Array.isArray(pending.payload.params) ? pending.payload.params : []
          )
  } catch (e) {
    ok = false
    outcome = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  // Cómo deshacerlo (solo los borrados de filas; el SQL destructivo no se puede deshacer)
  let undoId: number | null = null
  if (ok && Array.isArray(outcome.undo)) {
    undoId = await recordUndo(chatId, `Borrar: ${pending.summary}`, outcome.undo as UndoStep[]).catch((e) => {
      console.warn('[agent-undo] borrado', e instanceof Error ? e.message : e)
      return null
    })
    delete outcome.undo
  }
  await resolvePending(pending.id, ok ? 'done' : 'failed', outcome)
  await audit({
    chatId,
    userId,
    agent: 'doble-confirmacion',
    tool: pending.kind,
    args: { id: pending.id, payload: pending.payload, confirmado_por: claimed.confirmed_by },
    ok,
    result: outcome,
  })
  const resultLine = ok
    ? `Eliminado (${String(outcome.borradas ?? outcome.filas_afectadas ?? 0)} fila(s)).${
        undoId ? ' Si te has equivocado, escribe «deshacer».' : ''
      }`
    : `No se ha podido borrar: ${String(outcome.error)}`
  await saveMessage(chatId, userId, 'assistant', `[Borrado #${pending.id}: ${resultLine}]`)
  return resultLine
}

export async function sendPendingConfirmation(p: PendingAction): Promise<void> {
  // En WhatsApp no hay botones: se confirma escribiendo un código
  if (isWhatsAppChat(p.chat_id)) {
    await sendWhatsAppPendingConfirmation(p)
    return
  }
  const text = isOneStep(p)
    ? `${describe(p)}\n\n¿Lo borro? Pulsa «Sí, borrar» o escribe ok. Se puede deshacer. Caduca en ${DELETE_CONFIRM_TTL_MIN} min.`
    : `${describe(p)}\n\nPaso 1 de 2 · Esto no se puede deshacer. ¿Quieres ejecutarlo? Caduca en ${DELETE_CONFIRM_TTL_MIN} min.`
  const messageId = await sendText(p.chat_id, text, {
    buttons: [
      [
        { text: isOneStep(p) ? 'Sí, borrar' : 'Sí, eliminar', callback_data: `del:1:${p.id}` },
        { text: 'Cancelar', callback_data: `del:x:${p.id}` },
      ],
    ],
  })
  if (messageId) await setPendingMessage(p.id, messageId)
}

function who(cb: TgCallbackQuery): string {
  return cb.from.first_name || cb.from.username || String(cb.from.id)
}

export async function handleDeleteCallback(cb: TgCallbackQuery): Promise<void> {
  const [, step, id] = (cb.data || '').split(':')
  const chatId = cb.message?.chat.id
  const messageId = cb.message?.message_id
  const pending = id ? await getPending(id) : null
  if (!pending || !chatId || !messageId || pending.chat_id !== chatId) {
    await answerCallback(cb.id, 'Esta petición no existe')
    return
  }

  const expired = new Date(pending.expires_at).getTime() < Date.now()
  if (pending.status !== 'pending' || expired) {
    // Ya resuelta: no se toca el mensaje (ya dice el resultado), solo se avisa en la pulsación.
    const notice: Record<string, string> = {
      done: 'Ya se eliminó',
      executing: 'Se está eliminando',
      failed: 'Ya se intentó y falló',
      cancelled: 'Estaba cancelada',
      expired: 'Caducada',
    }
    if (pending.status === 'pending') {
      await resolvePending(pending.id, 'expired')
      await editText(chatId, messageId, `${describe(pending)}\n\nCaducada. No se ha borrado nada.`)
    }
    await answerCallback(cb.id, notice[pending.status] || 'Caducada')
    return
  }

  if (step === 'x') {
    await resolvePending(pending.id, 'cancelled', { by: who(cb) })
    await answerCallback(cb.id, 'Cancelado')
    await editText(chatId, messageId, `${describe(pending)}\n\nCancelado por ${who(cb)}. No se ha borrado nada.`)
    await saveMessage(chatId, cb.from.id, 'assistant', `[Borrado #${pending.id} cancelado por ${who(cb)}]`)
    return
  }

  if (step === '1' && isOneStep(pending)) {
    const claimed = await advancePending(pending.id, 0, 2, who(cb), 'executing')
    if (!claimed) {
      await answerCallback(cb.id, 'Ya se había pulsado')
      return
    }
    await answerCallback(cb.id, 'Borrando…')
    const resultLine = await executeConfirmedPending(pending, claimed, chatId, cb.from.id)
    await editText(chatId, messageId, `${describe(pending)}\n\n${resultLine}`)
    return
  }

  if (step === '1') {
    const advanced = await advancePending(pending.id, 0, 1, who(cb))
    if (!advanced) {
      await answerCallback(cb.id, 'Ya se había pulsado')
      return
    }
    await answerCallback(cb.id)
    await editText(
      chatId,
      messageId,
      `${describe(pending)}\n\nPaso 2 de 2. Confirmación final\nEsto no se puede deshacer. ¿Seguro que quieres eliminarlo?`,
      [
        [
          { text: 'ELIMINAR DEFINITIVAMENTE', callback_data: `del:2:${pending.id}` },
          { text: 'Cancelar', callback_data: `del:x:${pending.id}` },
        ],
      ]
    )
    return
  }

  if (step === '2') {
    const claimed = await advancePending(pending.id, 1, 2, who(cb), 'executing')
    if (!claimed) {
      await answerCallback(cb.id, 'Falta el paso 1 o ya se ejecutó')
      return
    }
    await answerCallback(cb.id, 'Eliminando…')
    const resultLine = await executeConfirmedPending(pending, claimed, chatId, cb.from.id)
    await editText(chatId, messageId, `${describe(pending)}\n\n${resultLine}`)
    return
  }

  await answerCallback(cb.id)
}
