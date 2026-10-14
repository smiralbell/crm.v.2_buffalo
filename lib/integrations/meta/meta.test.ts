import { describe, expect, it } from 'vitest'
import {
  isMetaPageAllowed,
  pageAccessToken,
  pageOrigen,
  pagePipelineId,
  type MetaPageConfig,
} from '@/lib/integrations/meta/config'
import { signMetaBody, verifyMetaSignature, verifyMetaSubscription } from '@/lib/integrations/meta/crypto'
import {
  extractLeadgenEvents,
  nextMetaEventAction,
  parseGraphLead,
} from '@/lib/integrations/meta/parse'

const cfg = (over: Partial<MetaPageConfig> = {}): MetaPageConfig => ({
  graphVersion: 'v21.0',
  verifyToken: 'buffalo-verify',
  appSecret: 'app-secret',
  allowedPageIds: ['111'],
  pageTokens: { '111': 'PAGE_TOKEN_111' },
  defaultPageToken: null,
  pagePipelines: { '111': 'pipe-web-uuid' },
  pageOrigen: { '111': 'meta_ads' },
  ...over,
})

describe('Meta Lead Ads — verificación GET', () => {
  it('devuelve hub.challenge si el verify_token coincide', () => {
    const r = verifyMetaSubscription(
      { 'hub.mode': 'subscribe', 'hub.verify_token': 'buffalo-verify', 'hub.challenge': '42' },
      cfg()
    )
    expect(r).toEqual({ ok: true, challenge: '42' })
  })

  it('rechaza token distinto y token no configurado', () => {
    expect(
      verifyMetaSubscription(
        { 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '1' },
        cfg()
      ).ok
    ).toBe(false)
    expect(
      verifyMetaSubscription(
        { 'hub.mode': 'subscribe', 'hub.verify_token': 'x', 'hub.challenge': '1' },
        cfg({ verifyToken: null })
      )
    ).toMatchObject({ ok: false, status: 503 })
  })
})

describe('Meta Lead Ads — firma POST', () => {
  const body = '{"object":"page","entry":[]}'
  const secret = 'app-secret'

  it('acepta X-Hub-Signature-256 del body original', () => {
    const header = signMetaBody(body, secret)
    expect(verifyMetaSignature(body, header, secret)).toBe(true)
  })

  it('rechaza body alterado, firma vacía o secret ausente', () => {
    const header = signMetaBody(body, secret)
    expect(verifyMetaSignature(body + ' ', header, secret)).toBe(false)
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false)
    expect(verifyMetaSignature(body, header, '')).toBe(false)
  })
})

describe('Meta Lead Ads — leadgen y duplicados', () => {
  const payload = {
    object: 'page',
    entry: [
      {
        id: '111',
        changes: [
          {
            field: 'leadgen',
            value: { leadgen_id: 'L1', page_id: '111', form_id: 'F1', ad_id: 'A1' },
          },
          {
            field: 'leadgen',
            value: { leadgen_id: 'L1', page_id: '111', form_id: 'F1' },
          },
          {
            field: 'feed',
            value: { item: 'comment' },
          },
          {
            field: 'leadgen',
            value: { leadgen_id: 'L2', page_id: '111' },
          },
        ],
      },
    ],
  }

  it('extrae leadgen y no duplica el mismo leadgen_id en un lote', () => {
    const events = extractLeadgenEvents(payload)
    expect(events.map((e) => e.leadgen_id)).toEqual(['L1', 'L2'])
    expect(events[0].page_id).toBe('111')
    expect(events[0].form_id).toBe('F1')
  })

  it('ignora objetos que no son Page', () => {
    expect(extractLeadgenEvents({ object: 'user', entry: [] })).toEqual([])
  })

  it('no vuelve a crear un lead ya procesado; reintenta pending/failed', () => {
    expect(nextMetaEventAction(null)).toBe('insert')
    expect(nextMetaEventAction({ status: 'processed' })).toBe('skip_processed')
    expect(nextMetaEventAction({ status: 'ignored' })).toBe('skip_processed')
    expect(nextMetaEventAction({ status: 'pending' })).toBe('retry')
    expect(nextMetaEventAction({ status: 'failed' })).toBe('retry')
  })
})

describe('Meta Lead Ads — páginas, negocio y Graph fields', () => {
  it('restringe páginas y asigna pipeline/origen del negocio', () => {
    const c = cfg()
    expect(isMetaPageAllowed('111', c)).toBe(true)
    expect(isMetaPageAllowed('999', c)).toBe(false)
    expect(pagePipelineId('111', c)).toBe('pipe-web-uuid')
    expect(pageOrigen('111', c)).toBe('meta_ads')
    expect(pageAccessToken('111', c)).toBe('PAGE_TOKEN_111')
    expect(pageAccessToken('999', c)).toBe(null)
  })

  it('mapea nombre, email, teléfono y respuestas del formulario', () => {
    const parsed = parseGraphLead('L9', {
      id: 'L9',
      created_time: '2026-10-14T10:00:00+0000',
      ad_name: 'Demo ads',
      campaign_name: 'Q4',
      form_id: 'F9',
      field_data: [
        { name: 'full_name', values: ['Ana López'] },
        { name: 'email', values: ['Ana@Empresa.com'] },
        { name: 'phone_number', values: ['+34600111222'] },
        { name: 'company_name', values: ['Acme'] },
        { name: 'tipo', values: ['Clínica'] },
      ],
    })
    expect(parsed.nombre).toBe('Ana López')
    expect(parsed.email).toBe('ana@empresa.com')
    expect(parsed.telefono).toBe('+34600111222')
    expect(parsed.empresa).toBe('Acme')
    expect(parsed.answers.some((a) => a.name === 'tipo' && a.values[0] === 'Clínica')).toBe(true)
  })
})
