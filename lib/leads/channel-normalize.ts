import type { ChannelKey } from '@/lib/leads/analytics.types'

export function normalizeChannel(origen: string | null | undefined): ChannelKey {
  const o = (origen || '').trim().toLowerCase()
  if (!o) return 'unknown'
  if (o.includes('cold') || o === 'coldcall') return 'cold_calling'
  if (o.includes('email') || o.includes('mail_marketing') || o.includes('newsletter')) return 'email'
  // Paid: los leads de anuncios ya no se mezclan con la web orgánica
  if (o.includes('meta') || o.includes('facebook') || o === 'fb' || o.includes('fb_ads') || o.includes('instagram_ads')) {
    return 'meta_ads'
  }
  if (o.includes('google_ads') || o.includes('adwords') || o.includes('gclid') || o === 'sem') return 'google_ads'
  // Orgánico: recomendaciones de asistentes de IA (GEO)
  if (
    o.includes('chatgpt') ||
    o.includes('gpt') ||
    o.includes('perplexity') ||
    o.includes('gemini') ||
    o.includes('claude') ||
    o.includes('copilot') ||
    o.includes('geo') ||
    o.includes('ia_recom') ||
    o.includes('buscador_ia')
  ) {
    return 'ai_search'
  }
  if (
    o.includes('web') ||
    o.includes('form') ||
    o.includes('chat') ||
    o.includes('landing') ||
    o.includes('widget') ||
    o.includes('cal') ||
    o.includes('seo')
  ) {
    return 'web'
  }
  if (o.includes('insta')) return 'instagram'
  if (o.includes('linkedin')) return 'linkedin'
  if (o.includes('whats')) return 'whatsapp'
  if (o.includes('youtube')) return 'youtube'
  if (o.includes('tiktok')) return 'tiktok'
  if (o.includes('evento') || o.includes('ponencia')) return 'event'
  if (o.includes('refer') || o.includes('partner') || o.includes('recomend')) {
    return 'referral'
  }
  return 'other'
}
