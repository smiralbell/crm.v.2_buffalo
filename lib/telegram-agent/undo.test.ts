import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Deshacer. La base de datos está simulada: se prueba que solo se deshace lo de
 * la propia conversación y que, si la fila ha cambiado, no se pisa nada.
 */

const db = vi.hoisted(() => {
  const client = {
    query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] as unknown[], rowCount: 0 })),
    release: vi.fn(),
  }
  return {
    client,
    pool: {
      query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] as unknown[], rowCount: 0 })),
      connect: vi.fn(async () => client),
    },
  }
})

vi.mock('@/lib/db', () => ({ getPool: () => db.pool }))

import { isUndoRequest, isUndoable, undoAction } from './undo'

type Res = { rows: unknown[]; rowCount: number }

function answer(handlers: Array<(sql: string) => Res | undefined>) {
  db.client.query.mockImplementation(async (sql: string) => {
    for (const h of handlers) {
      const r = h(String(sql))
      if (r) return r
    }
    return { rows: [], rowCount: 0 }
  })
}

beforeEach(() => {
  db.client.query.mockReset()
  db.pool.query.mockClear()
})

describe('pedir deshacer', () => {
  it('«deshacer» se reconoce solo como orden suelta', () => {
    for (const t of ['deshacer', 'Deshazlo', '/deshacer', 'deshaz eso', 'vuelve atrás']) expect(isUndoRequest(t), t).toBe(true)
    for (const t of ['¿cómo se deshace una tarea?', 'deshacer la tarea de Juan no, la otra']) expect(isUndoRequest(t), t).toBe(false)
  })

  it('se pueden deshacer tareas, avisos y preferencias; lo que le llega al cliente no', () => {
    for (const t of ['tarea_crear', 'tarea_editar', 'tareas_mover', 'avisos_programar', 'instruccion_quitar', 'incidencia_resolver']) {
      expect(isUndoable(t), t).toBe(true)
    }
    expect(isUndoable('ticket_responder')).toBe(false)
  })
})

describe('undoAction', () => {
  it('busca solo en la conversación de quien lo pide', async () => {
    answer([])
    const res = await undoAction(7_000_034_611_223_344)
    const select = db.client.query.mock.calls.find(([sql]) => String(sql).includes('FROM agent_undo_log'))!
    expect(select[1]?.[0]).toBe(7_000_034_611_223_344)
    expect(res.ok).toBe(false)
  })

  it('si alguien ha cambiado la fila después, no deshace nada', async () => {
    answer([
      (sql) =>
        sql.includes('FROM agent_undo_log')
          ? {
              rows: [
                {
                  id: 1,
                  label: 'Cambiar la tarea',
                  undone_at: null,
                  steps: [{ op: 'revert', table: 'crm_user_tasks', before: { id: 'a' }, after: { id: 'a', status: 'done' } }],
                },
              ],
              rowCount: 1,
            }
          : undefined,
      (sql) =>
        sql.includes('pg_attribute')
          ? { rows: [{ attname: 'id', is_pk: true }, { attname: 'status', is_pk: false }], rowCount: 2 }
          : undefined,
    ])
    const res = await undoAction(1)
    expect(res).toEqual({ ok: false, error: expect.stringContaining('alguien ha cambiado') })
    const calls = db.client.query.mock.calls.map(([sql]) => String(sql))
    expect(calls).toContain('ROLLBACK')
    expect(calls).not.toContain('COMMIT')
  })

  it('lo ya deshecho no se deshace dos veces', async () => {
    answer([
      (sql) => (sql.includes('FROM agent_undo_log') ? { rows: [{ id: 1, label: 'X', undone_at: new Date(), steps: [] }], rowCount: 1 } : undefined),
    ])
    expect(await undoAction(1)).toEqual({ ok: false, error: '«X» ya estaba deshecho.' })
  })

  it('si todo cuadra, restaura y lo marca como deshecho', async () => {
    answer([
      (sql) =>
        sql.includes('FROM agent_undo_log')
          ? { rows: [{ id: 3, label: 'Borrar: la tarea', undone_at: null, steps: [{ op: 'restore', table: 'crm_user_tasks', rows: [{ id: 'a' }] }] }], rowCount: 1 }
          : undefined,
      (sql) => (sql.includes('pg_attribute') ? { rows: [{ attname: 'id', is_pk: true }], rowCount: 1 } : undefined),
      (sql) => (sql.startsWith('INSERT INTO') ? { rows: [], rowCount: 1 } : undefined),
    ])
    expect(await undoAction(1)).toEqual({ ok: true, deshecho: 'Borrar: la tarea' })
    const calls = db.client.query.mock.calls.map(([sql]) => String(sql))
    expect(calls.some((s) => s.startsWith('UPDATE agent_undo_log SET undone_at'))).toBe(true)
    expect(calls).toContain('COMMIT')
  })
})
