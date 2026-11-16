import { afterEach, describe, expect, it } from 'vitest'
import { demosWebhookSecret, isDemosWhatsAppConfigured, parseDemoWebhook, validDemosWebhookSecret } from './whatsapp'

function upsert(data: Record<string, unknown>, event = 'messages.upsert') {
  return { event, instance: 'demos', data }
}

describe('parseDemoWebhook (Evolution)', () => {
  it('lee un texto normal', () => {
    const r = parseDemoWebhook(
      upsert({ key: { id: 'ABC', remoteJid: '34600111222@s.whatsapp.net', fromMe: false }, message: { conversation: ' Hola ' } })
    )
    expect(r).toMatchObject({ ok: true, data: { messageId: 'ABC', senderPhone: '34600111222', text: 'Hola', hasMedia: false } })
  })

  it('saca el móvil de remoteJidAlt cuando WhatsApp manda un @lid', () => {
    const r = parseDemoWebhook(
      upsert({
        key: { id: 'L1', remoteJid: '123456789@lid', remoteJidAlt: '34600333444@s.whatsapp.net', fromMe: false },
        message: { extendedTextMessage: { text: 'Buenas' } },
      })
    )
    expect(r).toMatchObject({ ok: true, data: { senderPhone: '34600333444', text: 'Buenas' } })
  })

  it('acepta el evento en mayúsculas (MESSAGES_UPSERT)', () => {
    const r = parseDemoWebhook(
      upsert({ key: { id: 'X', remoteJid: '34600111222@s.whatsapp.net' }, message: { conversation: 'ok' } }, 'MESSAGES_UPSERT')
    )
    expect(r.ok).toBe(true)
  })

  it('ignora lo que manda el propio número, los grupos y otros eventos', () => {
    expect(parseDemoWebhook(upsert({ key: { id: 'A', remoteJid: '34600111222@s.whatsapp.net', fromMe: true }, message: { conversation: 'x' } }))).toMatchObject({ ok: false, reason_code: 'from_me' })
    expect(parseDemoWebhook(upsert({ key: { id: 'B', remoteJid: '1203@g.us' }, message: { conversation: 'x' } }))).toMatchObject({ ok: false, reason_code: 'not_private_chat' })
    expect(parseDemoWebhook(upsert({}, 'connection.update'))).toMatchObject({ ok: false, reason_code: 'event_ignored' })
  })

  it('ignora reacciones', () => {
    const r = parseDemoWebhook(
      upsert({ key: { id: 'R', remoteJid: '34600111222@s.whatsapp.net' }, message: { reactionMessage: { text: '👍' } } })
    )
    expect(r).toMatchObject({ ok: false, reason_code: 'no_content' })
  })

  it('detecta nota de voz e imagen con pie', () => {
    const audio = parseDemoWebhook(
      upsert({ key: { id: 'AU', remoteJid: '34600111222@s.whatsapp.net' }, message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } } })
    )
    expect(audio).toMatchObject({ ok: true, data: { mediaType: 'audio', hasMedia: true, mediaReadable: true, text: '' } })

    const image = parseDemoWebhook(
      upsert({ key: { id: 'IM', remoteJid: '34600111222@s.whatsapp.net' }, message: { imageMessage: { caption: '¿Qué es esto?', mimetype: 'image/jpeg' } } })
    )
    expect(image).toMatchObject({ ok: true, data: { mediaType: 'image', mediaReadable: true, text: '¿Qué es esto?', mediaCaption: '¿Qué es esto?' } })
  })
})

describe('configuración de las demos', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('solo está activa con servidor, clave e instancia', () => {
    process.env.EVOLUTION_API_URL = 'https://evo.example.com'
    process.env.EVOLUTION_API_KEY = 'k'
    delete process.env.EVOLUTION_DEMOS_INSTANCE
    expect(isDemosWhatsAppConfigured()).toBe(false)
    process.env.EVOLUTION_DEMOS_INSTANCE = 'demos'
    expect(isDemosWhatsAppConfigured()).toBe(true)
  })

  it('el secreto del webhook se valida y uno distinto no entra', () => {
    process.env.EVOLUTION_API_KEY = 'k'
    process.env.EVOLUTION_DEMOS_INSTANCE = 'demos'
    delete process.env.DEMOS_WEBHOOK_SECRET
    const secret = demosWebhookSecret()
    expect(secret).toHaveLength(48)
    expect(validDemosWebhookSecret(secret)).toBe(true)
    expect(validDemosWebhookSecret('x'.repeat(48))).toBe(false)
    expect(validDemosWebhookSecret('')).toBe(false)
  })
})
