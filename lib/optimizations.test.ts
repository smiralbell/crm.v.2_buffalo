import { describe, expect, it } from 'vitest'
import { extractWebAttribution } from '@/lib/marketing/web-form-submissions.types'
import { canonicalStage } from '@/lib/pipelines/unified-funnel'
import { pickCertainInvoice } from '@/lib/finance/auto-reconcile'
import { buildComercialBriefing } from '@/lib/briefing/daily'
import { moduleFromStack } from '@/lib/ai/gateway'
import { retryDelayMs } from '@/lib/jobs/queue'
import { parseWebChatPayload, webChatMessageKey } from '@/lib/inbox/web-chat'

describe('atribución de envíos web', () => {
  it('lee UTM de los campos del formulario', () => {
    expect(extractWebAttribution({ utm_source: 'meta', utm_campaign: 'otono' })).toMatchObject({
      utm_source: 'meta',
      utm_campaign: 'otono',
    })
  })
  it('si faltan, los saca de la URL de la página', () => {
    const a = extractWebAttribution({ page_url: 'https://agenciabuffalo.es/agentes?gclid=xyz&utm_medium=cpc' })
    expect(a).toMatchObject({ gclid: 'xyz', utm_medium: 'cpc', landing_page: 'https://agenciabuffalo.es/agentes' })
  })
  it('sin nada útil → null', () => {
    expect(extractWebAttribution({ page_url: 'https://agenciabuffalo.es/' })).toBeNull()
    expect(extractWebAttribution(null)).toBeNull()
  })
})

describe('embudo único: columnas → etapa canónica', () => {
  it.each([
    ['LEAD', 'LEAD'],
    ['1 LLAMADA NO CONTESTADA', 'CONTACTO'],
    ['LLAMAR MAS TARDE', 'CONTACTO'],
    ['INTERESADO', 'CONTACTO'],
    ['REUNIÓN', 'REUNIÓN'],
    ['Reunion', 'REUNIÓN'],
    ['PROPUESTA ENVIADA', 'PROPUESTA ENVIADA'],
    ['FACTURA EMITIDA', 'FACTURA EMITIDA'],
    ['NO INTERESADO', 'PERDIDO'],
  ])('%s → %s', (column, expected) => {
    expect(canonicalStage(column)).toBe(expected)
  })
  it('columnas que no encajan se ignoran', () => {
    expect(canonicalStage('Cosas varias')).toBeNull()
  })
})

describe('conciliación automática: solo sin dudas', () => {
  const inv = (id: number, client: string, total: number, number = `F-${id}`) => ({
    id,
    invoice_number: number,
    client_name: client,
    total,
    subtotal: total,
    iva: 0,
    issue_date: '2026-10-01',
  })
  const income = (amount: number, description: string) => ({ amount, description, date: '2026-10-05' })

  it('importe exacto + cliente en el concepto → la vincula', () => {
    expect(pickCertainInvoice(income(1210, 'TRANSF ACME SOLUCIONES'), [inv(1, 'Acme Soluciones', 1210), inv(2, 'Otra', 99)])).toBe(1)
  })
  it('importe exacto sin cliente identificado → no', () => {
    expect(pickCertainInvoice(income(1210, 'TRANSFERENCIA'), [inv(1, 'Acme Soluciones', 1210)])).toBeNull()
  })
  it('dos facturas con el mismo importe → no adivina', () => {
    expect(
      pickCertainInvoice(income(300, 'TRANSF BETA CONSULTING'), [inv(1, 'Beta Consulting', 300), inv(2, 'Beta Consulting', 300)])
    ).toBeNull()
  })
  it('importe parecido pero no exacto → no', () => {
    expect(pickCertainInvoice(income(1200, 'TRANSF ACME SOLUCIONES'), [inv(1, 'Acme Soluciones', 1210)])).toBeNull()
  })
})

describe('briefing del comercial', () => {
  it('resume devoluciones de hoy, vencidas y reuniones por confirmar', () => {
    const cb = (nombre: string, at: string) => ({
      id: 1, nombre, empresa: null, telefono: null, email: null, campaign_id: null, campaign_name: null, at, notas: null,
    })
    const text = buildComercialBriefing({
      name: 'Ana López',
      today: '2026-10-14',
      callbacks: [cb('Pepe', '2026-10-14T09:00:00Z'), cb('Luis', '2026-10-10T09:00:00Z')],
      toConfirm: [],
      baseUrl: 'https://crm.test',
    })
    expect(text).toContain('Buenos días, Ana')
    expect(text).toContain('Devoluciones de hoy (1)')
    expect(text).toContain('11:00 · Pepe') // hora de Madrid
    expect(text).toContain('Vencidas (1)')
    expect(text).toContain('https://crm.test/comercial')
  })
})

describe('pasarela IA: módulo que llama', () => {
  it('lo deduce de la pila (pages/api o lib)', () => {
    const stack = [
      'Error',
      '    at aiFetch (C:\\app\\lib\\ai\\gateway.ts:10:1)',
      '    at openRouterChatCompletion (C:\\app\\lib\\openrouter.ts:20:1)',
      '    at runAudit (C:\\app\\lib\\onboarding\\audit\\agent.ts:5:1)',
    ].join('\n')
    expect(moduleFromStack(stack)).toBe('onboarding')
    expect(moduleFromStack('Error\n    at x (/app/.next/server/pages/api/retencion/chat.js:1:1)')).toBe('retencion')
  })
})

describe('cola: espera entre reintentos', () => {
  it('crece y tiene tope', () => {
    expect(retryDelayMs(1)).toBe(60_000)
    expect(retryDelayMs(3)).toBe(240_000)
    expect(retryDelayMs(20)).toBe(3_600_000)
  })
})

describe('chat web: entrada del bot de n8n', () => {
  it('acepta nombres de campo habituales', () => {
    expect(parseWebChatPayload({ sessionId: 's', message: 'hola', role: 'ai' })).toMatchObject({
      session_id: 's',
      text: 'hola',
      role: 'assistant',
    })
  })
  it('sin sesión o sin texto → rechazado', () => {
    expect(parseWebChatPayload({ text: 'hola' })).toBeNull()
    expect(parseWebChatPayload({ session_id: 's' })).toBeNull()
  })
  it('clave estable para no duplicar reenvíos', () => {
    const p = parseWebChatPayload({ session_id: 's', text: 'hola', at: '2026-10-14T08:00:00Z' })!
    expect(webChatMessageKey(p)).toBe(webChatMessageKey({ ...p }))
    expect(webChatMessageKey({ ...p, message_id: 'm1' })).toBe('wc:m1')
  })
})
