import { beforeEach, describe, expect, it, vi } from 'vitest'

const notify = vi.fn(async (_payload: unknown) => undefined)
vi.mock('./notify', () => ({ notify: (x: unknown) => notify(x) }))
vi.mock('./reminders', () => ({ scheduleReminder: vi.fn(async () => undefined), cancelReminders: vi.fn(async () => undefined) }))
vi.mock('@/lib/db', () => ({ getPool: () => ({ query: async () => ({ rows: [] }) }) }))
vi.mock('@/lib/ops-alerts', () => ({ opsLink: (p: string) => `https://crm.test${p}` }))
vi.mock('@/lib/project-access', () => ({ getProjectDevelopers: async () => [] }))

import { notifyTaskMoved } from './team-events'

const base = { taskId: 't1', title: 'Enviar propuesta', from: 'Pendiente', to: 'En curso', projectName: 'PREICO' }

describe('aviso de tarea movida', () => {
  beforeEach(() => notify.mockClear())

  it('avisa a los asignados, pero no a quien la mueve', async () => {
    await notifyTaskMoved({ ...base, userIds: [5, 6], actorId: 5, actorName: 'Abel' })
    expect(notify).toHaveBeenCalledTimes(1)
    const call = notify.mock.calls[0][0] as { event: string; userIds: number[]; text: string }
    expect(call.event).toBe('tarea_movida')
    expect(call.userIds).toEqual([6])
    expect(call.text).toContain('De «Pendiente» a «En curso»')
  })

  it('si solo la mueve su asignado, no sale ningún aviso', async () => {
    await notifyTaskMoved({ ...base, userIds: [5], actorId: 5, actorName: 'Abel' })
    expect(notify).not.toHaveBeenCalled()
  })

  it('una tarea sin asignados no avisa a nadie', async () => {
    await notifyTaskMoved({ ...base, userIds: [], actorId: 5 })
    expect(notify).not.toHaveBeenCalled()
  })
})
