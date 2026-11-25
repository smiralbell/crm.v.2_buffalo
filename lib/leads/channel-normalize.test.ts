import { describe, expect, it } from 'vitest'
import { normalizeChannel } from '@/lib/leads/channel-normalize'
import { CHANNEL_GROUP } from '@/lib/leads/analytics.types'
import { COST_CHANNEL_META } from '@/lib/leads/channel-costs'

describe('normalizeChannel: canales de marketing separados', () => {
  it('los leads de anuncios de Meta ya no cuentan como Web', () => {
    expect(normalizeChannel('meta_ads')).toBe('meta_ads')
    expect(normalizeChannel('Facebook Lead Ads')).toBe('meta_ads')
    expect(CHANNEL_GROUP.meta_ads).toBe('paid')
  })
  it('Google Ads tiene su propio canal', () => {
    expect(normalizeChannel('google_ads')).toBe('google_ads')
    expect(normalizeChannel('adwords')).toBe('google_ads')
  })
  it('la web orgánica sigue siendo Web', () => {
    for (const o of ['web', 'formulario_web', 'chat_widget', 'landing', 'cal.com', 'seo']) {
      expect(normalizeChannel(o)).toBe('web')
    }
    expect(CHANNEL_GROUP.web).toBe('organic')
  })
  it('recomendaciones de ChatGPT y otros asistentes van a Buscadores IA (GEO)', () => {
    expect(normalizeChannel('chatgpt')).toBe('ai_search')
    expect(normalizeChannel('Perplexity')).toBe('ai_search')
  })
  it('mantiene los canales que ya existían', () => {
    expect(normalizeChannel('cold_calling')).toBe('cold_calling')
    expect(normalizeChannel('email outreach')).toBe('email')
    expect(normalizeChannel('instagram')).toBe('instagram')
    expect(normalizeChannel('whatsapp')).toBe('whatsapp')
    expect(normalizeChannel('referido')).toBe('referral')
    expect(normalizeChannel('LinkedIn')).toBe('linkedin')
    expect(normalizeChannel('youtube')).toBe('youtube')
    expect(normalizeChannel('tiktok')).toBe('tiktok')
    expect(normalizeChannel('evento')).toBe('event')
    expect(normalizeChannel('')).toBe('unknown')
    expect(normalizeChannel('feria')).toBe('other')
  })
  it('el gasto de Meta y Google se compara con sus propios leads, no con los de la web', () => {
    expect(COST_CHANNEL_META.meta.lead_channel).toBe('meta_ads')
    expect(COST_CHANNEL_META.google.lead_channel).toBe('google_ads')
  })
})
