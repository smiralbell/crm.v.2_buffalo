import { afterEach, describe, expect, it } from 'vitest'
import { isAuthorized } from './config'
import { isDestructiveSql } from './db-tools'
import { nextRunFor } from './scheduler'

const ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ENV }
})

describe('isAuthorized', () => {
  const noMembers = async () => false
  const groupMembers = (ids: string[]) => async (_g: string, u: string) => ids.includes(u)

  it('deja pasar a los socios cuyo chat privado recibe los avisos', async () => {
    process.env.TELEGRAM_CHAT_IDS = '111,222'
    expect(await isAuthorized(111, 111, 'private', noMembers)).toBe(true)
    expect(await isAuthorized(222, 222, 'private', noMembers)).toBe(true)
    expect(await isAuthorized(333, 333, 'private', noMembers)).toBe(false)
  })

  it('si los avisos van a un grupo, sus miembros son los socios (en privado y en el grupo)', async () => {
    process.env.TELEGRAM_CHAT_IDS = '-4500'
    const members = groupMembers(['111', '222'])
    expect(await isAuthorized(111, 111, 'private', members)).toBe(true)
    expect(await isAuthorized(222, -4500, 'group', members)).toBe(true)
    expect(await isAuthorized(999, 999, 'private', members)).toBe(false)
    expect(await isAuthorized(999, -4500, 'group', members)).toBe(false)
  })

  it('no contesta en grupos que no son los de avisos ni en privados ajenos', async () => {
    process.env.TELEGRAM_CHAT_IDS = '-4500'
    process.env.TELEGRAM_AGENT_USER_IDS = '111'
    const members = groupMembers(['111'])
    expect(await isAuthorized(111, -9999, 'supergroup', members)).toBe(false)
    expect(await isAuthorized(111, 222, 'private', members)).toBe(false)
  })
})

describe('isDestructiveSql', () => {
  it.each([
    'DELETE FROM leads WHERE id = 1',
    'drop table leads',
    'TRUNCATE invoices',
    'ALTER TABLE leads DROP COLUMN notas',
    'with x as (delete from leads returning *) select * from x',
  ])('bloquea %s', (sql) => expect(isDestructiveSql(sql)).toBe(true))

  it.each([
    "UPDATE leads SET estado = 'caliente' WHERE id = 1",
    "INSERT INTO crm_checklist_items (title) VALUES ('x')",
    'ALTER TABLE leads ADD COLUMN prioridad TEXT',
    "UPDATE leads SET notas = 'deleted_at'",
  ])('permite %s', (sql) => expect(isDestructiveSql(sql)).toBe(false))
})

describe('nextRunFor', () => {
  it('no repite los avisos de una vez', () => {
    expect(nextRunFor({ repetir: 'nunca', next_run_at: '2026-11-02T08:00:00Z' })).toBeNull()
  })

  it('mantiene la hora de Madrid al cambiar al horario de invierno', () => {
    // 24-oct-2026 09:00 Madrid (UTC+2) → 26-oct 09:00 Madrid (UTC+1)
    const next = nextRunFor(
      { repetir: 'diario', next_run_at: '2026-10-24T07:00:00Z' },
      new Date('2026-10-25T12:00:00Z')
    )
    expect(next?.toISOString()).toBe('2026-10-26T08:00:00.000Z')
  })

  it('laborables salta el fin de semana', () => {
    // Viernes 6-nov-2026 09:00 Madrid → lunes 9-nov
    const next = nextRunFor(
      { repetir: 'laborables', next_run_at: '2026-11-06T08:00:00Z' },
      new Date('2026-11-06T08:00:01Z')
    )
    expect(next?.toISOString()).toBe('2026-11-09T08:00:00.000Z')
  })
})
