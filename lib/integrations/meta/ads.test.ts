import { describe, expect, it } from 'vitest'
import { getMetaAdsConfig, normalizeAdAccountId } from '@/lib/integrations/meta/config'
import {
  aggregateAdditiveStats,
  budgetFromCents,
  chunkDateRange,
  monthDateBounds,
  parseCampaignRow,
  parseInsightRow,
  pickActionValue,
} from '@/lib/integrations/meta/ads-parse'

describe('Meta Ads — cuentas y presupuesto', () => {
  it('normaliza IDs act_ y rechaza basura', () => {
    expect(normalizeAdAccountId('act_123')).toBe('act_123')
    expect(normalizeAdAccountId('123')).toBe('act_123')
    expect(normalizeAdAccountId(' act_99 ')).toBe('act_99')
    expect(normalizeAdAccountId('nope')).toBeNull()
  })

  it('convierte presupuesto en céntimos a unidades', () => {
    expect(budgetFromCents('15000')).toBe(150)
    expect(budgetFromCents(2500)).toBe(25)
    expect(budgetFromCents(null)).toBeNull()
  })
})

describe('Meta Ads — insights diarios', () => {
  it('separa clics de enlace, visitas a destino y leads (sin duplicar tipos de lead)', () => {
    const row = parseInsightRow(
      {
        campaign_id: 'C1',
        campaign_name: 'Q4',
        date_start: '2026-10-01',
        date_stop: '2026-10-01',
        spend: '40.00',
        impressions: '1000',
        reach: '800',
        inline_link_clicks: '20',
        actions: [
          { action_type: 'link_click', value: '18' },
          { action_type: 'landing_page_view', value: '12' },
          { action_type: 'lead', value: '3' },
          { action_type: 'offsite_conversion.fb_pixel_lead', value: '3' },
        ],
        cost_per_inline_link_click: '2.00',
      },
      'act_1'
    )
    expect(row?.link_clicks).toBe(20)
    expect(row?.landing_page_views).toBe(12)
    expect(row?.leads).toBe(3)
    expect(row?.reach).toBe(800)
    expect(row?.cpc).toBe(2)
  })

  it('si hay fila de insights, una acción ausente es 0, no null', () => {
    const row = parseInsightRow(
      {
        campaign_id: 'C2',
        date_start: '2026-10-02',
        spend: '5',
        impressions: '10',
        reach: '8',
        actions: [],
      },
      'act_1'
    )
    expect(row?.link_clicks).toBe(0)
    expect(row?.landing_page_views).toBe(0)
    expect(row?.leads).toBe(0)
    expect(row?.cost_per_lead).toBeNull()
  })

  it('ignora filas sin campaign_id o fecha', () => {
    expect(parseInsightRow({ date_start: '2026-10-01' }, 'act_1')).toBeNull()
    expect(parseInsightRow({ campaign_id: 'C1' }, 'act_1')).toBeNull()
  })
})

describe('Meta Ads — agregación del periodo', () => {
  it('suma gasto/impresiones/clics/visitas/leads y NO suma alcance', () => {
    const totals = aggregateAdditiveStats(
      [
        { spend: 10, impressions: 100, link_clicks: 4, landing_page_views: 2, leads: 1 },
        { spend: 30, impressions: 300, link_clicks: 6, landing_page_views: 3, leads: 1 },
      ],
      250
    )
    expect(totals.spend).toBe(40)
    expect(totals.impressions).toBe(400)
    expect(totals.link_clicks).toBe(10)
    expect(totals.landing_page_views).toBe(5)
    expect(totals.leads).toBe(2)
    expect(totals.reach).toBe(250)
    expect(totals.cpc).toBe(4)
    expect(totals.cost_per_lead).toBe(20)
  })

  it('sin alcance consultado el periodo deja reach en null', () => {
    const totals = aggregateAdditiveStats(
      [{ spend: 10, impressions: 1, link_clicks: 1, landing_page_views: 0, leads: 0 }],
      null
    )
    expect(totals.reach).toBeNull()
    expect(totals.cost_per_lead).toBeNull()
  })
})

describe('Meta Ads — campañas y rangos', () => {
  it('parsea estado y presupuesto de la campaña', () => {
    const c = parseCampaignRow(
      {
        id: 'C9',
        name: 'Prospecting',
        status: 'ACTIVE',
        effective_status: 'ACTIVE',
        daily_budget: '5000',
        objective: 'OUTCOME_LEADS',
      },
      'act_1'
    )
    expect(c?.daily_budget).toBe(50)
    expect(c?.effective_status).toBe('ACTIVE')
  })

  it('parte el histórico en ventanas de 31 días', () => {
    const chunks = chunkDateRange('2026-01-01', '2026-03-05', 31)
    expect(chunks[0]).toEqual({ since: '2026-01-01', until: '2026-01-31' })
    expect(chunks[chunks.length - 1]?.until).toBe('2026-03-05')
    expect(chunks.every((c) => c.since <= c.until)).toBe(true)
  })

  it('acota un mes civil', () => {
    expect(monthDateBounds('2026-02')).toEqual({ since: '2026-02-01', until: '2026-02-28' })
  })

  it('pickActionValue usa el primer tipo, no suma solapes', () => {
    expect(
      pickActionValue(
        [
          { action_type: 'lead', value: '2' },
          { action_type: 'omni_lead', value: '2' },
        ],
        ['lead', 'omni_lead']
      )
    ).toBe(2)
  })
})

describe('Meta Ads — config sin secretos', () => {
  it('sin env, el token de anuncios no está presente', () => {
    const cfg = getMetaAdsConfig()
    expect(cfg.adsToken).toBeNull()
    expect(cfg.adAccountIds).toEqual([])
  })
})
