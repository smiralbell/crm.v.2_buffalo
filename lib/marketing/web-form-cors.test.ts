import { describe, expect, it } from 'vitest'
import { isAllowedWebOrigin } from '@/lib/marketing/web-form-cors'
import { normalizeWebFormPayload } from '@/lib/marketing/web-form-submissions.types'

describe('CORS de formularios web', () => {
  it('acepta los dominios de Buffalo y sus subdominios', () => {
    for (const o of [
      'https://agenciabuffalo.es',
      'https://www.agenciabuffalo.es',
      'https://buffaloia.com',
      'https://www.buffaloia.com',
      'https://academy.buffaloia.com',
      'https://creative.buffaloia.com',
    ]) {
      expect(isAllowedWebOrigin(o)).toBe(true)
    }
  })

  it('rechaza otros orígenes y parecidos', () => {
    for (const o of [
      undefined,
      '',
      'null',
      'https://evil.com',
      'https://buffaloia.com.evil.com',
      'https://notbuffaloia.com',
      'https://agenciabuffalo.es.evil.net',
    ]) {
      expect(isAllowedWebOrigin(o)).toBe(false)
    }
  })
})

describe('payloads reales de la web', () => {
  it('formulario genérico (main.js): site, servicio, origen y datos', () => {
    const p = normalizeWebFormPayload({
      name: 'Ana López',
      email: 'ana@empresa.com',
      company: 'Empresa SL',
      phone: '600000000',
      service: 'Agente de llamadas',
      message: 'Quiero una demo',
      consent: 'on',
      site: 'www.agenciabuffalo.es',
      fullname: 'Ana López',
      interest: 'Agente de llamadas',
      source: 'web-contact',
      page_url: 'https://www.agenciabuffalo.es/contact/?utm_source=google',
      timestamp: '2026-11-12T10:00:00.000Z',
    })
    expect(p.site).toBe('agenciabuffalo.es')
    expect(p.cuerpo?.fullname).toBe('Ana López')
    expect(p.cuerpo?.email).toBe('ana@empresa.com')
    expect(p.cuerpo?.phone).toBe('600000000')
    expect(p.cuerpo?.service).toBe('Agente de llamadas')
    expect(p.cuerpo?.source).toBe('web-contact')
  })

  it('landing legal: site es el dominio de la web, no la web del despacho', () => {
    const p = normalizeWebFormPayload({
      site: 'www.agenciabuffalo.es',
      service: 'Asistente virtual con IA para despachos de abogados',
      fullname: 'Luis Vidal',
      email: 'luis@vidal.es',
      company: 'https://vidal.es',
      phone: '+34600111222',
      website: 'https://vidal.es',
      source: 'landing-legal',
      page_url: 'https://www.agenciabuffalo.es/llamadas-con-ia-para-el-sector-legal/',
    })
    expect(p.site).toBe('agenciabuffalo.es')
    expect(p.cuerpo?.fullname).toBe('Luis Vidal')
    expect(p.cuerpo?.service).toContain('despachos de abogados')
  })

  it('academy: formato plano con site y page_url', () => {
    const p = normalizeWebFormPayload({
      site: 'academy.buffaloia.com',
      page_url: 'https://academy.buffaloia.com/',
      source: 'web-academy',
      intent: 'fundae',
      nombre: 'Marta',
      empresa: 'Acme',
      email: 'marta@acme.com',
      telefono: '600123123',
      website: '',
    })
    expect(p.site).toBe('academy.buffaloia.com')
    expect(p.cuerpo?.fullname).toBe('Marta')
    expect(p.cuerpo?.company).toBe('Acme')
    expect(p.cuerpo?.phone).toBe('600123123')
  })

  it('creative: { site, page, form }', () => {
    const p = normalizeWebFormPayload({
      site: 'creative.buffaloia.com',
      page: '/',
      form: { nombre: 'Pau', email: 'pau@x.com', sector: 'Software', mensaje: 'Hola' },
    })
    expect(p.site).toBe('creative.buffaloia.com')
    expect(p.cuerpo?.fullname).toBe('Pau')
  })
})
