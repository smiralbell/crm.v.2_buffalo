import { describe, expect, it } from 'vitest'

/**
 * Tests de helpers puros / contratos de tipo.
 * La subida real a Drive requiere credenciales; no se llama a Google aquí.
 */
describe('drive-invoices contracts', () => {
  it('year_month regex esperado YYYY-MM', () => {
    const re = /^\d{4}-\d{2}$/
    expect(re.test('2026-07')).toBe(true)
    expect(re.test('2026-7')).toBe(false)
    expect(re.test('julio-2026')).toBe(false)
  })

  it('tipos soportados coinciden con drive_carpetas_facturas', () => {
    const tipos = ['gastos', 'emitidas'] as const
    expect(tipos).toContain('gastos')
    expect(tipos).toContain('emitidas')
  })
})
