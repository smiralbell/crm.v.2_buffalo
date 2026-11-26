import { afterEach, describe, expect, it } from 'vitest'
import {
  backgroundSlots,
  bankSyncMinGapMs,
  checkIntervalMs,
  isBackgroundSyncDue,
  isBankSyncStale,
} from './daily-sync-scheduler'

const ENV = { ...process.env }
afterEach(() => {
  process.env = { ...ENV }
})

describe('sincronización bancaria automática', () => {
  it('por defecto cada 20 minutos, tanto la comprobación como el mínimo entre syncs', () => {
    delete process.env.BANK_SYNC_MIN_MINUTES
    delete process.env.BANK_SYNC_CHECK_MINUTES
    expect(bankSyncMinGapMs()).toBe(20 * 60_000)
    expect(checkIntervalMs()).toBe(20 * 60_000)
  })

  it('se puede cambiar en minutos', () => {
    process.env.BANK_SYNC_MIN_MINUTES = '5'
    process.env.BANK_SYNC_CHECK_MINUTES = '10'
    expect(bankSyncMinGapMs()).toBe(5 * 60_000)
    expect(checkIntervalMs()).toBe(10 * 60_000)
  })

  it('una sincronización de hace 20 minutos ya está caducada; una de hace 19, no', () => {
    delete process.env.BANK_SYNC_MIN_MINUTES
    const now = Date.parse('2026-11-23T10:00:00Z')
    expect(isBankSyncStale(new Date(now - 20 * 60_000), now)).toBe(true)
    expect(isBankSyncStale(new Date(now - 19 * 60_000), now)).toBe(false)
    expect(isBankSyncStale(null, now)).toBe(true)
  })
})

describe('sincronización en segundo plano por franjas (límite PSD2)', () => {
  // 23 nov 2026: Madrid = UTC+1
  const at = (hhmmUtc: string) => Date.parse(`2026-11-23T${hhmmUtc}:00Z`)

  it('antes de la primera franja del día no toca', () => {
    delete process.env.BANK_SYNC_SLOTS
    expect(isBackgroundSyncDue(null, undefined, at('06:00'))).toBe(false) // 07:00 Madrid
  })

  it('al empezar una franja toca, y no se repite aunque falle', () => {
    delete process.env.BANK_SYNC_SLOTS
    const now = at('06:40') // 07:40 Madrid, franja de las 07:30
    expect(isBackgroundSyncDue(new Date(at('00:00')), undefined, now)).toBe(true)
    expect(isBackgroundSyncDue(new Date(at('00:00')), at('06:35'), now)).toBe(false)
    expect(isBackgroundSyncDue(new Date(at('06:31')), undefined, now)).toBe(false)
  })

  it('como mucho 4 al día por defecto', () => {
    delete process.env.BANK_SYNC_SLOTS
    expect(backgroundSlots()).toHaveLength(4)
  })
})
