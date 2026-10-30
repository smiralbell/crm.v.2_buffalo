import { DELETE_CONFIRM_TTL_MIN } from './config'
import { executeDeleteRows, executeDestructiveSql, type DeleteRowsPayload } from './db-tools'
import {
  advancePending,
  audit,
  getPending,
  resolvePending,
  saveMessage,
  setPendingMessage,
  type PendingAction,
} from './store'
import { answerCallback, editText, sendText, type TgCallbackQuery } from './telegram-api'

/**
 * Doble confirmación de borrados. El agente (LLM) nunca borra: solo crea una
 * petición pendiente. El borrado lo ejecuta este archivo cuando un socio pulsa
 *   1) «Sí, eliminar»  →  2) «ELIMINAR DEFINITIVAMENTE»
 * en el mensaje de Telegram. Cada pulsación avanza el paso de forma atómica en BD.
 */

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

export async function sendPendingConfirmation(p: PendingAction): Promise<void> {
  const text = `${describe(p)}\n\nPaso 1 de 2 · ¿Quieres eliminarlo? Caduca en ${DELETE_CONFIRM_TTL_MIN} min.`
  const messageId = await sendText(p.chat_id, text, {
    buttons: [
      [
        { text: 'Sí, eliminar', callback_data: `del:1:${p.id}` },
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
    await resolvePending(pending.id, ok ? 'done' : 'failed', outcome)
    await audit({
      chatId,
      userId: cb.from.id,
      agent: 'doble-confirmacion',
      tool: pending.kind,
      args: { id: pending.id, payload: pending.payload, confirmado_por: claimed.confirmed_by },
      ok,
      result: outcome,
    })
    const resultLine = ok
      ? `Eliminado (${String(outcome.borradas ?? outcome.filas_afectadas ?? 0)} fila(s)). Confirmado por ${claimed.confirmed_by}.`
      : `No se ha podido borrar: ${String(outcome.error)}`
    await editText(chatId, messageId, `${describe(pending)}\n\n${resultLine}`)
    await saveMessage(chatId, cb.from.id, 'assistant', `[Borrado #${pending.id}: ${resultLine}]`)
    return
  }

  await answerCallback(cb.id)
}
