import { describe, expect, it } from 'vitest'
import { annualGoalAlertKey, formatAnnualGoalReachedAlert } from './annual-target-alert'

describe('aviso objetivo anual', () => {
  it('usa una clave única por año y meta', () => {
    expect(annualGoalAlertKey(2026, 65000)).toBe('2026:65000')
    expect(annualGoalAlertKey(2026, 65000.4)).toBe('2026:65000')
    expect(annualGoalAlertKey(2027, 65000)).toBe('2027:65000')
  })

  it('monta mail y Telegram con facturado, meta y enlaces', () => {
    const msg = formatAnnualGoalReachedAlert({
      year: 2026,
      target: 65_000,
      invoicedYtd: 66_200,
    })
    expect(msg.subject).toContain('2026')
    expect(msg.subject).toContain('65.000')
    expect(msg.text).toContain('66.200')
    expect(msg.text).toContain('cobros')
    expect(msg.text).toContain('/finances')
    expect(msg.text).toContain('/dashboard')
    expect(msg.telegramHtml).toContain('<b>')
    expect(msg.telegramHtml).toContain('superado')
  })
})
