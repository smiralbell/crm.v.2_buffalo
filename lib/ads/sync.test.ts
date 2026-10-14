import { describe, expect, it } from 'vitest'
import { adsPeriodBounds, daysAgoRange, mapGoogleAdsRow, mapMetaInsight } from '@/lib/ads/sync'

describe('Ads: mapeo de filas', () => {
  it('Meta Insights → fila diaria', () => {
    expect(
      mapMetaInsight({
        date_start: '2026-10-01',
        campaign_id: '111',
        campaign_name: 'Otoño',
        spend: '12.50',
        impressions: '1000',
        clicks: '40',
      })
    ).toEqual({
      channel: 'meta',
      date: '2026-10-01',
      campaign_id: '111',
      campaign_name: 'Otoño',
      spend_eur: 12.5,
      impressions: 1000,
      clicks: 40,
    })
    expect(mapMetaInsight({ spend: '1' })).toBeNull()
  })

  it('Google Ads (micros) → euros', () => {
    expect(
      mapGoogleAdsRow({
        campaign: { id: '222', name: 'Brand' },
        metrics: { costMicros: '1235000', impressions: '80', clicks: '3' },
        segments: { date: '2026-10-02' },
      })
    ).toEqual({
      channel: 'google',
      date: '2026-10-02',
      campaign_id: '222',
      campaign_name: 'Brand',
      spend_eur: 1.24,
      impressions: 80,
      clicks: 3,
    })
  })

  it('periodo YYYY-MM y rango de días', () => {
    expect(adsPeriodBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(adsPeriodBounds('nope')).toBeNull()
    expect(daysAgoRange(3, new Date('2026-10-14T12:00:00Z'))).toEqual({
      since: '2026-10-12',
      until: '2026-10-14',
    })
  })
})
