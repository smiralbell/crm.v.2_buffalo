import { describe, expect, it } from 'vitest'
import {
  canSeeClientPrices,
  mergeHiddenPriceLines,
  stripPriceLines,
} from '@/lib/price-visibility'
import { hideLeadPrices, sanitizeConfiguracionPrices } from '@/lib/onboarding/sanitize-config-prices'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import { canAccessPage } from '@/lib/auth-rbac'

const encode = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64')

describe('quién ve precios', () => {
  it('admin y comercial sí; developer y project manager no', () => {
    expect(canSeeClientPrices('admin')).toBe(true)
    expect(canSeeClientPrices('comercial')).toBe(true)
    expect(canSeeClientPrices('developer')).toBe(false)
    expect(canSeeClientPrices('project_manager')).toBe(false)
  })
})

describe('textos sin precios', () => {
  it('quita líneas con importes y deja el resto', () => {
    const text = 'Agente de voz para citas\nSetup: 3.500 €\nIntegración con su CRM\nMensualidad 250€/mes'
    expect(stripPriceLines(text)).toBe('Agente de voz para citas\nIntegración con su CRM')
  })

  it('al guardar conserva las líneas de precio que el usuario no vio', () => {
    const stored = 'Agente de voz\nSetup: 3.500 €'
    expect(mergeHiddenPriceLines(stored, 'Agente de voz y chat')).toBe(
      'Agente de voz y chat\nSetup: 3.500 €'
    )
  })
})

describe('configuración del lead', () => {
  const raw = encode({
    mode: 'custom',
    title: 'Agente Clínica',
    voz: true,
    setup_total_eur: 4200,
    monthly_fee_eur: 300,
    line_items: [{ description: 'Agente de voz', amount_eur: 3000 }],
    linked_invoices: [{ id: 1, invoice_number: 'F-1', total: 2100, status: 'paid', linked_at: 'x' }],
    proposal_draft: 'Inversión total 4.200 €',
    contract_draft: 'Precio: 4.200 €',
    description: 'Agente que agenda citas\nPrecio cerrado 4.200 €',
  })

  it('elimina importes, facturas, propuesta y contrato', () => {
    const cfg = parseConfiguradorConfig(sanitizeConfiguracionPrices(raw))!
    expect(cfg.title).toBe('Agente Clínica')
    expect(cfg.voz).toBe(true)
    expect(cfg.setup_total_eur).toBeUndefined()
    expect(cfg.monthly_fee_eur).toBeUndefined()
    expect(cfg.linked_invoices).toBeUndefined()
    expect(cfg.proposal_draft).toBeUndefined()
    expect(cfg.contract_draft).toBeUndefined()
    expect(cfg.line_items).toEqual([{ description: 'Agente de voz', amount_eur: 0 }])
    expect(cfg.description).toBe('Agente que agenda citas')
  })

  it('hideLeadPrices solo actúa sobre quien no ve precios', () => {
    const lead = { id: 1, valor: 4200, configuracion: raw }
    expect(hideLeadPrices(lead, 'admin')).toBe(lead)
    const pm = hideLeadPrices(lead, 'project_manager')
    expect(pm.valor).toBeNull()
    expect(pm.configuracion).not.toBe(raw)
  })
})

describe('páginas con precios para el project manager', () => {
  it('bloquea configurador, documentos y analítica', () => {
    for (const p of ['/leads/analytics', '/onboarding/configure', '/onboarding/propuesta', '/onboarding/contrato', '/onboarding/factura']) {
      expect(canAccessPage(p, 'project_manager'), p).toBe(false)
    }
    expect(canAccessPage('/onboarding/notas', 'project_manager')).toBe(true)
  })
})
