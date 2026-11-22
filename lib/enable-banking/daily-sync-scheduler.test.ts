import { afterEach, describe, expect, it } from 'vitest'
import { bankSyncMinGapMs, checkIntervalMs, isBankSyncStale } from './daily-sync-scheduler'

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
