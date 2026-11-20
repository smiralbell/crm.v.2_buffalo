import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Preferencias y avisos de cada persona. El store está simulado: lo que se prueba
 * es que el dueño y la conversación los pone el servidor, nunca la IA.
 */

const store = vi.hoisted(() => ({
  addPersonalInstruction: vi.fn(async (_owner: string, texto: string) => ({ ok: true, instruccion: { id: 1, texto } })),
  listPersonalInstructions: vi.fn(async () => [{ id: 1, texto: 'Sé breve' }]),
  updatePersonalInstruction: vi.fn(async () => ({ id: 1, texto: 'Muy breve' })),
  removePersonalInstruction: vi.fn(async () => ({ id: 1, texto: 'Sé breve' })),
  listChatReminders: vi.fn(async () => [] as unknown[]),
  addReminder: vi.fn(async (input: Record<string, unknown>) => ({
    id: 9,
    chat_id: input.chatId,
    tipo: input.tipo,
    texto: input.texto,
    destino: input.destino,
    repetir: input.repetir,
    next_run_at: (input.nextRunAt as Date).toISOString(),
    activo: true,
  })),
  updateReminder: vi.fn(async () => null as unknown),
}))

vi.mock('./store', () => store)

import { runPersonalTool } from './personal-tools'

const team = { ownerKey: 'user:5', chatId: 7_000_034_611_223_344, userId: 34611223344, ownChatOnly: true }

beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockClear()
})

describe('preferencias personales', () => {
  it('se guardan con el dueño que pone el servidor', async () => {
    await runPersonalTool('instruccion_guardar', { texto: 'Sé breve', owner_key: 'user:6' }, team)
    expect(store.addPersonalInstruction).toHaveBeenCalledWith('user:5', 'Sé breve')
  })

  it('solo se quitan las suyas', async () => {
    await runPersonalTool('instruccion_quitar', { id: 1 }, team)
    expect(store.removePersonalInstruction).toHaveBeenCalledWith('user:5', 1)
  })
})

describe('avisos del equipo', () => {
  it('siempre van a su propio chat, aunque la IA pida otro destino', async () => {
    const res = (await runPersonalTool(
      'avisos_programar',
      { tipo: 'tarea', texto: 'mis tareas', fecha_hora: '2099-01-05T09:00:00+01:00', repetir: 'semanal', destino: 'socios', chat_id: 1 },
      team
    )) as { ok: boolean }
    expect(res.ok).toBe(true)
    expect(store.addReminder).toHaveBeenCalledWith(expect.objectContaining({ chatId: team.chatId, destino: 'chat', repetir: 'semanal' }))
  })

  it('solo lista y cambia los de su chat', async () => {
    await runPersonalTool('avisos_listar', {}, team)
    expect(store.listChatReminders).toHaveBeenCalledWith(team.chatId)
    const res = (await runPersonalTool('avisos_cambiar', { id: 3, activo: false }, team)) as { ok: boolean }
    expect(store.updateReminder).toHaveBeenCalledWith(3, team.chatId, { activo: false })
    // El aviso 3 no es suyo: el store no lo encuentra en su chat
    expect(res.ok).toBe(false)
  })

  it('no deja programar en el pasado ni sin fecha válida', async () => {
    const past = (await runPersonalTool('avisos_programar', { tipo: 'texto', texto: 'x', fecha_hora: '2000-01-01T09:00:00Z' }, team)) as { ok: boolean }
    const bad = (await runPersonalTool('avisos_programar', { tipo: 'texto', texto: 'x', fecha_hora: 'mañana' }, team)) as { ok: boolean }
    expect(past.ok).toBe(false)
    expect(bad.ok).toBe(false)
    expect(store.addReminder).not.toHaveBeenCalled()
  })

  it('tiene un tope de avisos activos', async () => {
    store.listChatReminders.mockResolvedValueOnce(Array.from({ length: 20 }, (_, i) => ({ id: i })))
    const res = (await runPersonalTool('avisos_programar', { tipo: 'texto', texto: 'x', fecha_hora: '2099-01-01T09:00:00Z' }, team)) as { ok: boolean }
    expect(res.ok).toBe(false)
  })
})

describe('socios', () => {
  it('pueden cambiar cualquier aviso; programar y listar los lleva su agente', async () => {
    const socio = { ownerKey: 'chat:1', chatId: 1, userId: 1, ownChatOnly: false }
    await runPersonalTool('avisos_cambiar', { id: 3, repetir: 'diario' }, socio)
    expect(store.updateReminder).toHaveBeenCalledWith(3, null, { repetir: 'diario' })
    expect(await runPersonalTool('avisos_programar', {}, socio)).toBeUndefined()
    expect(await runPersonalTool('avisos_listar', {}, socio)).toBeUndefined()
  })
})
