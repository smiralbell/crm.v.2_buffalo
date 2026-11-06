import { afterEach, describe, expect, it } from 'vitest'
import { channelOf } from '@/lib/telegram-agent/channel'
import {
  isAllowedWhatsAppNumber,
  isWhatsAppAgentEnabled,
  isWhatsAppChat,
  phoneFromChatId,
  validWhatsAppSecret,
  waChatId,
  WA_CHAT_OFFSET,
} from './config'
import { parseConfirmCommand } from './confirm'
import { parseEvolutionWebhook, waUpdateId } from './payload'
import { isPublicWebhookUrl } from './setup'

const ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ENV }
})

/** Webhook messages.upsert de Evolution v2, como llega de verdad. */
function upsert(message: Record<string, unknown>, key: Record<string, unknown> = {}) {
  return {
    event: 'messages.upsert',
    instance: 'asistente-crm',
    data: {
      key: { remoteJid: '34600111222@s.whatsapp.net', fromMe: false, id: '3EB0ABC123', ...key },
      pushName: 'Santi',
      message,
      messageType: Object.keys(message)[0],
    },
  }
}

describe('parseEvolutionWebhook', () => {
  it('lee un texto normal y uno con formato', () => {
    expect(parseEvolutionWebhook(upsert({ conversation: ' Hola ' }))).toMatchObject({
      id: '3EB0ABC123',
      phone: '34600111222',
      pushName: 'Santi',
      text: 'Hola',
      kind: 'text',
    })
    expect(parseEvolutionWebhook(upsert({ extendedTextMessage: { text: 'leads de hoy' } }))?.text).toBe('leads de hoy')
  })

  it('reconoce notas de voz, fotos con pie y documentos', () => {
    expect(parseEvolutionWebhook(upsert({ audioMessage: { mimetype: 'audio/ogg; codecs=opus' } }))?.kind).toBe('audio')
    expect(parseEvolutionWebhook(upsert({ imageMessage: { caption: 'esta factura', mimetype: 'image/jpeg' } }))).toMatchObject({
      kind: 'image',
      text: 'esta factura',
    })
    expect(
      parseEvolutionWebhook(
        upsert({ documentWithCaptionMessage: { message: { documentMessage: { fileName: 'leads.csv', mimetype: 'text/csv', fileLength: '120' } } } })
      )
    ).toMatchObject({ kind: 'document', document: { fileName: 'leads.csv', mimetype: 'text/csv', size: 120 } })
  })

  it('con identificadores @lid usa el móvil del campo alternativo', () => {
    const msg = parseEvolutionWebhook(
      upsert({ conversation: 'hola' }, { remoteJid: '12345678901234@lid', remoteJidAlt: '34600111222@s.whatsapp.net' })
    )
    expect(msg?.phone).toBe('34600111222')
    expect(parseEvolutionWebhook(upsert({ conversation: 'hola' }, { remoteJid: '12345678901234@lid' }))).toBeNull()
  })

  it('ignora lo que envía el propio número, grupos, estados, reacciones y otros eventos', () => {
    expect(parseEvolutionWebhook(upsert({ conversation: 'x' }, { fromMe: true }))).toBeNull()
    expect(parseEvolutionWebhook(upsert({ conversation: 'x' }, { remoteJid: '1203630@g.us' }))).toBeNull()
    expect(parseEvolutionWebhook(upsert({ conversation: 'x' }, { remoteJid: 'status@broadcast' }))).toBeNull()
    expect(parseEvolutionWebhook(upsert({ reactionMessage: { text: '👍' } }))).toBeNull()
    expect(parseEvolutionWebhook(upsert({ protocolMessage: { type: 0 } }))).toBeNull()
    expect(parseEvolutionWebhook(upsert({ messageContextInfo: {} }))).toBeNull()
    expect(parseEvolutionWebhook({ event: 'connection.update', data: { state: 'open' } })).toBeNull()
    expect(parseEvolutionWebhook(null)).toBeNull()
  })

  it('un sticker llega como «other» para contestar que no se puede leer', () => {
    expect(parseEvolutionWebhook(upsert({ stickerMessage: {} }))?.kind).toBe('other')
  })
})

describe('conversaciones de WhatsApp', () => {
  it('cada móvil tiene su chat_id, fuera del rango de Telegram, y se puede volver atrás', () => {
    const id = waChatId('+34 600 11 12 22')
    expect(id).toBe(WA_CHAT_OFFSET + 34600111222)
    expect(Number.isSafeInteger(id)).toBe(true)
    expect(isWhatsAppChat(id)).toBe(true)
    expect(phoneFromChatId(id)).toBe('34600111222')
    expect(channelOf(id)).toBe('whatsapp')
  })

  it('los chats de Telegram (usuarios y grupos) siguen yendo por Telegram', () => {
    for (const tg of [123456789, 7123456789, -1001234567890]) {
      expect(isWhatsAppChat(tg)).toBe(false)
      expect(channelOf(tg)).toBe('telegram')
    }
  })

  it('el número de un móvil de 15 cifras sigue siendo exacto', () => {
    expect(phoneFromChatId(waChatId('999999999999999'))).toBe('999999999999999')
  })

  it('no repite mensajes: mismo id de WhatsApp, mismo update; distinto id, distinto', () => {
    expect(waUpdateId('3EB0ABC')).toBe(waUpdateId('3EB0ABC'))
    expect(waUpdateId('3EB0ABC')).not.toBe(waUpdateId('3EB0ABD'))
    expect(waUpdateId('3EB0ABC')).toBeGreaterThan(2 ** 32)
    expect(Number.isSafeInteger(waUpdateId('3EB0ABC'))).toBe(true)
  })
})

describe('configuración', () => {
  it('solo contesta a los números de WHATSAPP_AGENT_NUMBERS, escritos como sea', () => {
    process.env.WHATSAPP_AGENT_NUMBERS = '+34 600 111 222, 34600333444'
    expect(isAllowedWhatsAppNumber('34600111222')).toBe(true)
    expect(isAllowedWhatsAppNumber('34600333444')).toBe(true)
    expect(isAllowedWhatsAppNumber('34699999999')).toBe(false)
    expect(isAllowedWhatsAppNumber('')).toBe(false)
  })

  it('se activa con WHATSAPP_AGENT=1 y Evolution configurado', () => {
    process.env.WHATSAPP_AGENT = '1'
    process.env.EVOLUTION_API_URL = 'https://evo.example.com/'
    process.env.EVOLUTION_API_KEY = 'k'
    process.env.EVOLUTION_INSTANCE = 'asistente-crm'
    expect(isWhatsAppAgentEnabled()).toBe(true)
    delete process.env.EVOLUTION_INSTANCE
    expect(isWhatsAppAgentEnabled()).toBe(false)
    process.env.EVOLUTION_INSTANCE = 'asistente-crm'
    process.env.WHATSAPP_AGENT = '0'
    expect(isWhatsAppAgentEnabled()).toBe(false)
  })

  it('un CRM en local nunca apunta Evolution a sí mismo', () => {
    expect(isPublicWebhookUrl('https://crm.agenciabuffalo.es/api/webhooks/whatsapp?secret=x')).toBe(true)
    expect(isPublicWebhookUrl('http://localhost:3001/api/webhooks/whatsapp')).toBe(false)
    expect(isPublicWebhookUrl('https://localhost:3001/api/webhooks/whatsapp')).toBe(false)
    expect(isPublicWebhookUrl('https://127.0.0.1/api/webhooks/whatsapp')).toBe(false)
    expect(isPublicWebhookUrl('http://crm.agenciabuffalo.es/api/webhooks/whatsapp')).toBe(false)
  })

  it('el webhook exige el secreto exacto', () => {
    process.env.WHATSAPP_WEBHOOK_SECRET = 'secreto-largo-de-prueba'
    expect(validWhatsAppSecret('secreto-largo-de-prueba')).toBe(true)
    expect(validWhatsAppSecret('secreto-largo-de-prueba!')).toBe(false)
    expect(validWhatsAppSecret('')).toBe(false)
  })
})

describe('códigos de confirmación de borrado', () => {
  it('reconoce los dos pasos y cancelar, en mayúsculas o minúsculas', () => {
    expect(parseConfirmCommand('BORRAR a1b2c3d4e5')).toEqual({ step: '1', id: 'a1b2c3d4e5' })
    expect(parseConfirmCommand('borrar #A1B2C3D4E5')).toEqual({ step: '1', id: 'a1b2c3d4e5' })
    expect(parseConfirmCommand(' Eliminar  definitivamente a1b2c3d4e5 ')).toEqual({ step: '2', id: 'a1b2c3d4e5' })
    expect(parseConfirmCommand('CANCELAR a1b2c3d4e5')).toEqual({ step: 'x', id: 'a1b2c3d4e5' })
  })

  it('un «sí» o una frase con la palabra borrar no confirma nada', () => {
    expect(parseConfirmCommand('sí')).toBeNull()
    expect(parseConfirmCommand('borrar el lead de Juan')).toBeNull()
    expect(parseConfirmCommand('BORRAR a1b2c3d4e5 ya')).toBeNull()
    expect(parseConfirmCommand('ELIMINAR a1b2c3d4e5')).toBeNull()
  })
})
