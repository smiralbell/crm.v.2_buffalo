import {
  findActiveDemoByPhone,
  getConversationMessages,
  listAuthorizedPhones,
  saveConversationMessages,
} from './store'
import { normalizeWasenderPhone, phoneToWasenderRecipient } from './phone'
import { generateDemoReply } from './chat'
import { parseWasenderWebhook, sendWasenderTextMessage } from './wasender'
import { logDemoWebhook } from './webhook-log'

export async function handleDemoWasenderWebhook(body: unknown): Promise<{
  handled: boolean
  reason?: string
}> {
  const event =
    body && typeof body === 'object' && typeof (body as Record<string, unknown>).event === 'string'
      ? ((body as Record<string, unknown>).event as string)
      : null

  await logDemoWebhook({
    step: 'received',
    level: 'info',
    message: 'Webhook recibido',
    event,
    raw_body: body,
  })

  const parsed = parseWasenderWebhook(body)
  if (!parsed.ok) {
    await logDemoWebhook({
      step: 'parse',
      level: 'warn',
      message: parsed.reason,
      event: parsed.event ?? event,
      details: parsed.debug,
      raw_body: body,
    })
    return { handled: false, reason: parsed.reason_code }
  }

  const { data } = parsed

  await logDemoWebhook({
    step: 'parsed',
    level: 'info',
    message: `Mensaje: "${data.text.slice(0, 80)}${data.text.length > 80 ? '…' : ''}"`,
    event: data.event,
    phone: data.senderPhone,
    details: { fromMe: data.fromMe, sender_raw: data.senderPhone },
  })

  const phone = normalizeWasenderPhone(data.senderPhone)
  if (!phone) {
    await logDemoWebhook({
      step: 'phone',
      level: 'warn',
      message: `No se pudo normalizar el teléfono: ${data.senderPhone}`,
      event: data.event,
      details: { sender_raw: data.senderPhone },
    })
    return { handled: false, reason: 'invalid_phone' }
  }

  let demo = await findActiveDemoByPhone(phone)

  if (!demo && phone.startsWith('+34')) {
    const sin34 = `+${phone.slice(3)}`
    demo = await findActiveDemoByPhone(sin34)
    if (demo) {
      await logDemoWebhook({
        step: 'phone_match',
        level: 'info',
        message: `Coincidencia alternativa sin prefijo 34: ${sin34}`,
        phone: sin34,
        demo_id: demo.demo_id,
      })
    }
  }

  if (!demo) {
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 9 && /^[67]/.test(digits)) {
      const con34 = `+34${digits}`
      demo = await findActiveDemoByPhone(con34)
      if (demo) {
        await logDemoWebhook({
          step: 'phone_match',
          level: 'info',
          message: `Coincidencia añadiendo prefijo +34: ${con34}`,
          phone: con34,
          demo_id: demo.demo_id,
        })
      }
    }
  }

  if (!demo) {
    const authorized = await listAuthorizedPhones()
    await logDemoWebhook({
      step: 'no_demo',
      level: 'warn',
      message: `Número ${phone} no está en ninguna demo activa`,
      event: data.event,
      phone,
      details: {
        normalized_phone: phone,
        authorized_phones: authorized,
        hint: 'Comprueba que el número en la demo coincide (ej. +34612345678)',
      },
    })
    return { handled: false, reason: 'no_active_demo' }
  }

  await logDemoWebhook({
    step: 'demo_found',
    level: 'info',
    message: `Demo: ${demo.nombre_cliente}`,
    event: data.event,
    phone,
    demo_id: demo.demo_id,
  })

  try {
    const history = await getConversationMessages(demo.demo_id, phone)

    await logDemoWebhook({
      step: 'openrouter',
      level: 'info',
      message: `Generando respuesta (${process.env.DEMO_OPENROUTER_MODEL || '~anthropic/claude-sonnet-latest'})…`,
      phone,
      demo_id: demo.demo_id,
      details: { history_messages: history.length },
    })

    const reply = await generateDemoReply(
      demo.prompt,
      demo.base_conocimiento,
      history,
      data.text
    )

    const now = new Date().toISOString()
    const updatedHistory = [
      ...history,
      { role: 'user' as const, content: data.text, at: now },
      { role: 'assistant' as const, content: reply, at: now },
    ]

    await saveConversationMessages(demo.demo_id, phone, updatedHistory)

    const recipient = phoneToWasenderRecipient(phone)
    await logDemoWebhook({
      step: 'wasender_send',
      level: 'info',
      message: `Enviando respuesta a ${recipient}…`,
      phone,
      demo_id: demo.demo_id,
      details: { reply_preview: reply.slice(0, 120) },
    })

    await sendWasenderTextMessage(recipient, reply)

    await logDemoWebhook({
      step: 'done',
      level: 'success',
      message: 'Respuesta enviada correctamente',
      phone,
      demo_id: demo.demo_id,
    })

    return { handled: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    await logDemoWebhook({
      step: 'error',
      level: 'error',
      message: msg,
      phone,
      demo_id: demo.demo_id,
    })
    throw err
  }
}
