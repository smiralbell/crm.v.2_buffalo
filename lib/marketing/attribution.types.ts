/**
 * Atribución manual de leads: «cómo nos conoció» (canal que cuenta en Marketing)
 * y «por dónde entró». Lo que pone el equipo manda sobre lo detectado automáticamente.
 */
import { normalizeChannel } from '@/lib/leads/channel-normalize'
import { CHANNEL_LABELS, type ChannelKey } from '@/lib/leads/analytics.types'

/** Canales que se pueden elegir. `origen` es el texto que se guarda al crear un lead a mano. */
export const ATTRIBUTION_CHANNELS = [
  { id: 'ai_search', label: 'GEO · Recomendado por una IA', origen: 'geo' },
  { id: 'email', label: 'Email outreach', origen: 'email' },
  { id: 'meta_ads', label: 'Meta Ads', origen: 'meta_ads' },
  { id: 'google_ads', label: 'Google Ads', origen: 'google_ads' },
  { id: 'web', label: 'Web / SEO', origen: 'web' },
  { id: 'linkedin', label: 'LinkedIn', origen: 'linkedin' },
  { id: 'instagram', label: 'Instagram', origen: 'instagram' },
  { id: 'youtube', label: 'YouTube', origen: 'youtube' },
  { id: 'tiktok', label: 'TikTok', origen: 'tiktok' },
  { id: 'cold_calling', label: 'Cold calling', origen: 'cold_calling' },
  { id: 'referral', label: 'Referido / partner', origen: 'referido' },
  { id: 'event', label: 'Evento / ponencia', origen: 'evento' },
  { id: 'other', label: 'Otro', origen: 'otro' },
] as const satisfies readonly { id: ChannelKey; label: string; origen: string }[]

export type AttributionChannel = (typeof ATTRIBUTION_CHANNELS)[number]['id']

export const ATTRIBUTION_VIAS = [
  { id: 'movil', label: 'Llamada a nuestro móvil' },
  { id: 'llamada', label: 'Llamada a la empresa' },
  { id: 'cal', label: 'Agendó reunión (Cal)' },
  { id: 'formulario', label: 'Formulario web' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Respondió por email' },
  { id: 'redes', label: 'Mensaje en redes' },
  { id: 'presencial', label: 'En persona' },
  { id: 'otra', label: 'Otra' },
] as const

export type AttributionVia = (typeof ATTRIBUTION_VIAS)[number]['id']

export type Attribution = {
  lead_id: number
  canal: AttributionChannel
  via: AttributionVia | null
  nota: string | null
  /** Lo que había detectado el CRM al confirmarlo */
  detectado: string | null
  updated_by: string | null
  updated_at: string
}

export type AttributionLead = {
  id: number
  name: string
  empresa: string | null
  created_at: string | null
  origen: string | null
  /** Canal automático (a partir del origen del lead) */
  auto: ChannelKey
  /** Canal que cuenta: el confirmado o, si no hay, el automático */
  canal: ChannelKey
  canal_label: string
  attribution: Attribution | null
  needs_review: boolean
  reason: string | null
}

export type AttributionMonth = { period: string; leads: AttributionLead[]; pending: number }

const isCalOrigin = (o: string) => /(^|[^a-z])cal(\.?com)?([^a-z]|$)/.test(o)

/** Por qué conviene que alguien confirme el canal (null = está claro). */
export function reviewReason(origen: string | null | undefined): string | null {
  const o = (origen || '').trim().toLowerCase()
  const auto = normalizeChannel(origen)
  if (auto === 'unknown') return 'Sin origen'
  if (auto === 'whatsapp') return 'Escribió por WhatsApp: falta saber cómo nos conoció'
  if (auto === 'web' && isCalOrigin(o)) return 'Agendó directamente: puede venir de un email u otro canal'
  if (auto === 'other') return `Origen no reconocido: «${origen}»`
  return null
}

/** Vía más probable según el origen, para proponerla al confirmar. */
export function guessVia(origen: string | null | undefined): AttributionVia | null {
  const o = (origen || '').trim().toLowerCase()
  if (!o || o.includes('cold')) return null
  if (isCalOrigin(o)) return 'cal'
  if (o.includes('form') || o.includes('meta')) return 'formulario'
  if (o.includes('whats')) return 'whatsapp'
  return null
}

export function effectiveChannel(origen: string | null | undefined, a: Pick<Attribution, 'canal'> | null | undefined): ChannelKey {
  return a?.canal ?? normalizeChannel(origen)
}

export const channelOrigin = (id: AttributionChannel) => ATTRIBUTION_CHANNELS.find((c) => c.id === id)!.origen
export const attributionLabel = (id: ChannelKey) =>
  ATTRIBUTION_CHANNELS.find((c) => c.id === id)?.label ?? CHANNEL_LABELS[id]
