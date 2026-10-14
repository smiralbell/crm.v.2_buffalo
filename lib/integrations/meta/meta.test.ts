import { describe, expect, it } from 'vitest'
import {
  isMetaPageAllowed,
  pageAccessToken,
  pageOrigen,
  pagePipelineId,
  type MetaPageConfig,
} from '@/lib/integrations/meta/config'
import { signMetaBody, verifyMetaSignature, verifyMetaSubscription } from '@/lib/integrations/meta/crypto'
import { formatMetaLeadAlert } from '@/lib/integrations/meta/alerts'
import {
  extraMetaAnswers,
  extractLeadgenEvents,
  formatMetaRef,
  mergeWebhookIntoLead,
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
      ad_id: 'A9',
      ad_name: 'Demo ads',
      adset_id: 'S9',
      adset_name: 'Lookalike ES',
      campaign_id: 'C9',
      campaign_name: 'Q4',
      form_id: 'F9',
      platform: 'ig',
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
    expect(parsed.campaign_id).toBe('C9')
    expect(parsed.adset_name).toBe('Lookalike ES')
    expect(parsed.ad_id).toBe('A9')
    expect(parsed.form_id).toBe('F9')
    expect(parsed.platform).toBe('ig')
    expect(parsed.answers.some((a) => a.name === 'tipo' && a.values[0] === 'Clínica')).toBe(true)
  })

  it('acepta leads de prueba u orgánicos sin campaña, anuncio ni formulario', () => {
    const parsed = parseGraphLead('L-test', {
      id: 'L-test',
      is_organic: true,
      field_data: [
        { name: 'full_name', values: ['<test lead: dummy data for full_name>'] },
        { name: 'email', values: ['test@meta.com'] },
      ],
    })
    expect(parsed.campaign_id).toBeNull()
    expect(parsed.ad_id).toBeNull()
    expect(parsed.form_id).toBeNull()
    expect(parsed.form_name).toBeNull()
    expect(parsed.is_organic).toBe(true)
    expect(formatMetaRef(parsed.campaign_name, parsed.campaign_id)).toBeNull()
  })

  it('acepta automáticamente un formulario nuevo de una página autorizada', () => {
    const events = extractLeadgenEvents({
      object: 'page',
      entry: [
        {
          id: '111',
          changes: [
            {
              field: 'leadgen',
              value: {
                leadgen_id: 'L-nuevo',
                page_id: '111',
                form_id: 'formulario-nunca-visto-antes',
                ad_id: 'ad-nuevo',
                adgroup_id: 'adset-nuevo',
              },
            },
          ],
        },
      ],
    })
    expect(events).toHaveLength(1)
    expect(events[0].form_id).toBe('formulario-nunca-visto-antes')
    expect(isMetaPageAllowed(events[0].page_id, cfg())).toBe(true)
  })

  it('conserva preguntas extra del formulario sin mapeo previo', () => {
    const parsed = parseGraphLead('L10', {
      id: 'L10',
      field_data: [
        { name: 'email', values: ['a@b.com'] },
        { name: 'presupuesto_mensual', values: ['3000'] },
        { name: 'horario_preferido', values: ['mañana'] },
      ],
    })
    const extra = extraMetaAnswers(parsed.answers)
    expect(extra.map((a) => a.name).sort()).toEqual(['horario_preferido', 'presupuesto_mensual'])
  })

  it('completa IDs del webhook si Graph no los trae', () => {
    const fromGraph = parseGraphLead('L11', { id: 'L11', field_data: [] })
    const merged = mergeWebhookIntoLead(fromGraph, {
      leadgen_id: 'L11',
      page_id: '111',
      form_id: 'F-new',
      ad_id: 'A-new',
      adgroup_id: 'S-new',
      created_time: null,
    })
    expect(merged.page_id).toBe('111')
    expect(merged.form_id).toBe('F-new')
    expect(merged.ad_id).toBe('A-new')
    expect(merged.adset_id).toBe('S-new')
  })
})

describe('Meta Lead Ads — aviso Gmail + Telegram', () => {
  it('monta el aviso con contacto, campaña y enlace a la ficha', () => {
    const msg = formatMetaLeadAlert({
      leadId: 57,
      lead: {
        leadgen_id: 'L-av',
        created_time: null,
        page_id: '111',
        page_name: 'Buffalo',
        platform: 'ig',
        is_organic: false,
        ad_id: null,
        ad_name: null,
        adset_id: null,
        adset_name: null,
        campaign_id: 'C9',
        campaign_name: 'Q4 Abogados',
        form_id: 'F9',
        form_name: 'Demo',
        nombre: 'Ana López',
        email: 'ana@empresa.com',
        telefono: '+34600111222',
        empresa: 'Acme',
        answers: [],
      },
    })
    expect(msg.subject).toContain('Ana López')
    expect(msg.text).toContain('ana@empresa.com')
    expect(msg.text).toContain('Q4 Abogados')
    expect(msg.text).toContain('/leads/57')
    expect(msg.telegramHtml).toContain('<b>')
  })
})
