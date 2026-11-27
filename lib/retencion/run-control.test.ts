import { describe, expect, it } from 'vitest'
import { RunStopped, checkStop, isRunning, markFinished, markRunning, raceStop, requestStop } from './run-control'

describe('parar ejecuciones', () => {
  it('solo se puede parar lo que está en marcha', () => {
    expect(requestStop('x')).toBe(false)
    markRunning('x')
    expect(isRunning('x')).toBe(true)
    expect(() => checkStop('x')).not.toThrow()
    expect(requestStop('x')).toBe(true)
    expect(() => checkStop('x')).toThrow(RunStopped)
    markFinished('x')
    expect(isRunning('x')).toBe(false)
    expect(() => checkStop('x')).not.toThrow()
  })

  it('corta una espera larga en cuanto se pide parar', async () => {
    markRunning('y')
    const slow = new Promise<string>((r) => setTimeout(() => r('tarde'), 5000))
    const p = raceStop('y', slow)
    setTimeout(() => requestStop('y'), 50)
    await expect(p).rejects.toBeInstanceOf(RunStopped)
    markFinished('y')
  })

  it('deja pasar el resultado si nadie para', async () => {
    markRunning('z')
    await expect(raceStop('z', Promise.resolve(7))).resolves.toBe(7)
    markFinished('z')
  })
})
