import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Confirmar borrados con «ok» y deshacer. Base de datos y canales simulados: se
 * prueba quién decide (el sistema, no la IA) y qué se ejecuta con cada respuesta.
 */

const m = vi.hoisted(() => ({
  listFreshPending: vi.fn(async () => [] as unknown[]),
  advancePending: vi.fn(async (id: string, _from: number, to: number, by: string) => ({ id, step: to, confirmed_by: by })),
  resolvePending: vi.fn(async () => undefined),
  saveMessage: vi.fn(async () => undefined),
  audit: vi.fn(async () => undefined),
  executeDeleteRows: vi.fn(async () => ({ ok: true, borradas: 1, filas: [], undo: [{ op: 'restore', table: 't', rows: [{ id: 1 }] }] })),
  executeDestructiveSql: vi.fn(async () => ({ ok: true, filas_afectadas: 0 })),
  recordUndo: vi.fn(async () => 42),
}))

vi.mock('./store', () => ({
  listFreshPending: m.listFreshPending,
  advancePending: m.advancePending,
  resolvePending: m.resolvePending,
  saveMessage: m.saveMessage,
  audit: m.audit,
  getPending: vi.fn(),
  setPendingMessage: vi.fn(),
}))
vi.mock('./db-tools', () => ({ executeDeleteRows: m.executeDeleteRows, executeDestructiveSql: m.executeDestructiveSql }))
vi.mock('./undo', () => ({ recordUndo: m.recordUndo }))
vi.mock('./telegram-api', () => ({ answerCallback: vi.fn(), editText: vi.fn(), sendText: vi.fn() }))
vi.mock('@/lib/whatsapp-agent/confirm', () => ({ sendWhatsAppPendingConfirmation: vi.fn() }))

import { confirmFreshByText, isOneStep, parseQuickReply } from './confirm'

const WA_CHAT = 7_000_034_611_223_344

function pending(over: Record<string, unknown> = {}) {
  return {
    id: 'abcdef0123',
    chat_id: WA_CHAT,
    requested_by: null,
    kind: 'delete_rows',
    payload: { table: 'crm_user_tasks', where: 'id = $1', params: ['x'], expected: 1 },
    summary: 'Borrar la tarea "Llamar a Juan"',
    preview: null,
    step: 0,
    status: 'pending',
    confirmed_by: null,
    message_id: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...over,
  }
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockClear()
})

describe('respuestas rápidas', () => {
  it('reconoce ok, vale, sí… y no, cancela…, con o sin código', () => {
    for (const t of ['ok', 'OK', 'Ok.', 'vale', 'sí', 'si', 'Sí, bórralo', 'dale!', 'confirmo']) expect(parseQuickReply(t)?.answer, t).toBe('yes')
    for (const t of ['no', 'No.', 'cancela', 'déjalo', 'mejor no']) expect(parseQuickReply(t)?.answer, t).toBe('no')
    expect(parseQuickReply('ok abcdef0123')).toEqual({ answer: 'yes', id: 'abcdef0123' })
  })

  it('una frase normal no es una confirmación', () => {
    for (const t of ['ok, pero antes dime cuántas hay', 'no sé', 'borra la otra', 'sí quiero ver mis tareas', '']) {
      expect(parseQuickReply(t), t).toBeNull()
    }
  })

  it('solo los borrados de filas van en un paso; el SQL destructivo no', () => {
    expect(isOneStep({ kind: 'delete_rows' })).toBe(true)
    expect(isOneStep({ kind: 'destructive_sql' })).toBe(false)
  })
})

describe('confirmar con ok', () => {
  it('si no hay nada recién pedido, el «ok» va a la IA', async () => {
    m.listFreshPending.mockResolvedValueOnce([])
    expect(await confirmFreshByText(WA_CHAT, 1, 'Abel', 'ok')).toBeNull()
    expect(m.executeDeleteRows).not.toHaveBeenCalled()
  })

  it('«ok» borra lo que el agente acaba de pedir y deja apuntado cómo deshacerlo', async () => {
    m.listFreshPending.mockResolvedValueOnce([pending()])
    const reply = await confirmFreshByText(WA_CHAT, 1, 'Abel', 'ok')
    expect(m.advancePending).toHaveBeenCalledWith('abcdef0123', 0, 2, 'Abel', 'executing')
    expect(m.executeDeleteRows).toHaveBeenCalledTimes(1)
    expect(m.recordUndo).toHaveBeenCalledWith(WA_CHAT, expect.stringContaining('Llamar a Juan'), [{ op: 'restore', table: 't', rows: [{ id: 1 }] }])
    expect(reply).toContain('deshacer')
  })

  it('si otro «ok» ya lo había reclamado, no se borra dos veces', async () => {
    m.listFreshPending.mockResolvedValueOnce([pending()])
    m.advancePending.mockResolvedValueOnce(null as never)
    await confirmFreshByText(WA_CHAT, 1, 'Abel', 'ok')
    expect(m.executeDeleteRows).not.toHaveBeenCalled()
  })

  it('«no» cancela sin borrar nada', async () => {
    m.listFreshPending.mockResolvedValueOnce([pending()])
    const reply = await confirmFreshByText(WA_CHAT, 1, 'Abel', 'no')
    expect(m.resolvePending).toHaveBeenCalledWith('abcdef0123', 'cancelled', { by: 'Abel' })
    expect(m.executeDeleteRows).not.toHaveBeenCalled()
    expect(reply).toContain('No he borrado nada')
  })

  it('el SQL destructivo no se ejecuta con un «ok»: pide el código', async () => {
    m.listFreshPending.mockResolvedValueOnce([pending({ kind: 'destructive_sql', payload: { sql: 'DROP TABLE x' } })])
    const reply = await confirmFreshByText(WA_CHAT, 1, 'Abel', 'ok')
    expect(m.executeDestructiveSql).not.toHaveBeenCalled()
    expect(reply).toContain('ELIMINAR DEFINITIVAMENTE abcdef0123')
  })

  it('«ok <código>» confirma solo ese', async () => {
    m.listFreshPending.mockResolvedValueOnce([pending(), pending({ id: '0000000000', summary: 'otra' })])
    await confirmFreshByText(WA_CHAT, 1, 'Abel', 'ok 0000000000')
    expect(m.advancePending).toHaveBeenCalledTimes(1)
    expect(m.advancePending).toHaveBeenCalledWith('0000000000', 0, 2, 'Abel', 'executing')
  })
})
