import { describe, expect, it } from 'vitest'
import { nextWatchRunAt } from './watch-store'

describe('nextWatchRunAt', () => {
  it('si está pausado no hay próxima', () => {
    expect(nextWatchRunAt(0, new Date())).toBeNull()
    expect(nextWatchRunAt(null, new Date())).toBeNull()
  })

  it('si nunca corrió, la próxima es ahora', () => {
    const iso = nextWatchRunAt(60, null)
    expect(iso).toBeTruthy()
    expect(Math.abs(new Date(iso as string).getTime() - Date.now()) < 2000).toBe(true)
  })
})
