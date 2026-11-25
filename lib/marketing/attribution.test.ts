import { describe, expect, it } from 'vitest'
import { ATTRIBUTION_CHANNELS, effectiveChannel, guessVia, reviewReason } from '@/lib/marketing/attribution.types'
import { attributionInput, manualLeadInput } from '@/lib/marketing/attribution'
import { normalizeChannel } from '@/lib/leads/channel-normalize'

describe('atribución de leads', () => {
  it('lo confirmado por el equipo manda; sin confirmar, lo automático', () => {
    expect(effectiveChannel('web_cal', { canal: 'email' })).toBe('email')
    expect(effectiveChannel('web_cal', null)).toBe('web')
  })
  it('pide confirmar las reuniones agendadas directamente y los leads sin origen claro', () => {
    expect(reviewReason('web_cal')).toContain('Agendó')
    expect(reviewReason('cal.com')).toContain('Agendó')
    expect(reviewReason(null)).toBe('Sin origen')
    expect(reviewReason('feria')).toContain('no reconocido')
    expect(reviewReason('whatsapp')).toContain('WhatsApp')
  })
  it('no molesta con los que están claros (ni confunde «cold_call» con Cal)', () => {
    for (const o of ['cold_calling', 'cold_call', 'meta_ads', 'formulario_web', 'email', 'chatgpt', 'referido', 'evento']) {
      expect(reviewReason(o)).toBeNull()
    }
    expect(guessVia('cold_calling')).toBeNull()
    expect(guessVia('web_cal')).toBe('cal')
  })
  it('un lead apuntado a mano se reconoce luego con el mismo canal', () => {
    for (const c of ATTRIBUTION_CHANNELS) expect(normalizeChannel(c.origen)).toBe(c.id)
  })
  it('valida lo que llega', () => {
    expect(manualLeadInput.safeParse({ nombre: 'Ana', canal: 'ai_search' }).success).toBe(false)
    expect(manualLeadInput.safeParse({ nombre: 'Ana', telefono: '600000000', canal: 'ai_search', via: 'movil' }).success).toBe(true)
    expect(manualLeadInput.safeParse({ nombre: 'Ana', email: 'mal', canal: 'ai_search' }).success).toBe(false)
    expect(attributionInput.safeParse({ lead_id: 1, canal: 'inventado' }).success).toBe(false)
  })
})
