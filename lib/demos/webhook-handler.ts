import {
  findActiveDemoByPhone,
  findPrincipalActiveDemo,
  getConversationMessages,
  listAuthorizedPhones,
  saveConversationMessages,
} from './store'
import { normalizeWhatsAppPhone } from './phone'
import { generateDemoReply } from './chat'
import { generateCrmAssistantReply } from './crm-assistant-chat'
import {
  joinWhatsAppMessages,
  splitReplyIntoWhatsAppMessages,
} from './format-output'
import { buildMessageDedupKey, claimIncomingDemoMessage, pruneOldProcessedMessages } from './dedup'
import { parseDemoWebhook, sendDemoMedia, sendDemoMessageSequence } from './whatsapp'
import { resolveUserMessage } from './resolve-user-message'
import { logDemoWebhook } from './webhook-log'
import type { AssistantAttachment } from './assistant-attachments'

/** El adjunto en base64 si lo tenemos en memoria o en disco; si no, su URL pública. */
async function attachmentMedia(att: AssistantAttachment): Promise<string | null> {
  const buffer =
    att.buffer ||
    (att.filePath ? await import('fs/promises').then((fs) => fs.readFile(att.filePath!)) : null)
  if (buffer) return buffer.toString('base64')
  return att.publicUrl || null
}

export async function handleDemoWhatsAppWebhook(body: unknown): Promise<{
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

  const parsed = parseDemoWebhook(body)
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

  const previewText = data.text || (data.hasMedia ? `[${data.mediaType}]` : '')

  await logDemoWebhook({
    step: 'parsed',
    level: 'info',
    message: `Mensaje${data.hasMedia ? ` (${data.mediaType})` : ''}: "${previewText.slice(0, 80)}${previewText.length > 80 ? '…' : ''}"`,
    event: data.event,
    phone: data.senderPhone,
    details: { sender_raw: data.senderPhone, has_media: data.hasMedia },
  })

  const phone = normalizeWhatsAppPhone(data.senderPhone)
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
    demo = await findPrincipalActiveDemo()
    if (demo) {
      await logDemoWebhook({
        step: 'principal_fallback',
        level: 'info',
        message: `Número ${phone} no está en ninguna demo de cliente → agente principal Buffalo (${demo.nombre_cliente})`,
        event: data.event,
        phone,
        demo_id: demo.demo_id,
      })
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
    details: { message_id: data.messageId },
  })

  const dedupKey = buildMessageDedupKey(
    data.messageId,
    phone,
    data.text || (data.hasMedia ? String(data.mediaType) : '')
  )
  const claimed = await claimIncomingDemoMessage(dedupKey, demo.demo_id, phone)
  if (!claimed) {
    await logDemoWebhook({
      step: 'duplicate',
      level: 'info',
      message: 'Mensaje duplicado ignorado (webhook ya procesado)',
      event: data.event,
      phone,
      demo_id: demo.demo_id,
      details: { message_id: data.messageId, dedup_key: dedupKey },
    })
    return { handled: false, reason: 'duplicate' }
  }

  void pruneOldProcessedMessages()

  let userText = data.text

  if (data.hasMedia) {
    try {
      await logDemoWebhook({
        step: 'media',
        level: 'info',
        message: `Procesando ${data.mediaType}…`,
        event: data.event,
        phone,
        demo_id: demo.demo_id,
        details: { media_type: data.mediaType },
      })

      const resolved = await resolveUserMessage(data.messageId, {
        text: data.text,
        mediaType: data.mediaType,
        hasMedia: data.hasMedia,
        mediaReadable: data.mediaReadable,
        mediaCaption: data.mediaCaption,
      })
      userText = resolved.text

      await logDemoWebhook({
        step: 'media',
        level: 'info',
        message: `Contenido resuelto (${resolved.source})`,
        event: data.event,
        phone,
        demo_id: demo.demo_id,
        details: { preview: userText.slice(0, 120) },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error procesando multimedia'
      await logDemoWebhook({
        step: 'media',
        level: 'error',
        message: msg,
        event: data.event,
        phone,
        demo_id: demo.demo_id,
        details: { media_type: data.mediaType },
      })

      const caption = data.mediaCaption || data.text.trim()
      if (data.mediaType === 'image' && caption) {
        userText = `[No pude analizar la imagen adjunta] El usuario escribió: «${caption}». Responde a su mensaje y dile amablemente que no has podido ver la imagen.`
      } else if (caption) {
        userText = `[No pude procesar el archivo adjunto] El usuario escribió: «${caption}». Responde a su mensaje.`
      } else {
        return { handled: false, reason: 'media_error' }
      }
    }
  }

  try {
    const history = await getConversationMessages(demo.demo_id, phone)

    await logDemoWebhook({
      step: 'openrouter',
      level: 'info',
      message: `Generando respuesta (${
        demo.es_asistente_crm ? 'asistente CRM · ' : ''
      }${process.env.DEMO_OPENROUTER_MODEL || '~anthropic/claude-sonnet-latest'})…`,
      phone,
      demo_id: demo.demo_id,
      details: { history_messages: history.length, es_asistente_crm: demo.es_asistente_crm },
    })

    const replyRaw = demo.es_asistente_crm
      ? await generateCrmAssistantReply(
          demo.prompt,
          demo.base_conocimiento,
          history,
          userText,
          phone
        )
      : {
          text: await generateDemoReply(
            demo.prompt,
            demo.base_conocimiento,
            history,
            userText,
            { demoId: demo.demo_id }
          ),
          attachments: [] as Awaited<
            ReturnType<typeof generateCrmAssistantReply>
          >['attachments'],
          actions_log: [] as string[],
        }

    const replyParts = splitReplyIntoWhatsAppMessages(replyRaw.text)
    const replyStored = joinWhatsAppMessages(replyParts)

    const now = new Date().toISOString()
    const updatedHistory = [
      ...history,
      { role: 'user' as const, content: userText, at: now },
      { role: 'assistant' as const, content: replyStored, at: now },
    ]

    await saveConversationMessages(demo.demo_id, phone, updatedHistory)

    await logDemoWebhook({
      step: 'whatsapp_send',
      level: 'info',
      message: `Enviando ${replyParts.length} mensaje(s) a ${phone}…`,
      phone,
      demo_id: demo.demo_id,
      details: {
        parts: replyParts,
        reply_preview: replyStored.slice(0, 120),
        attachments: replyRaw.attachments.length,
        actions_log: replyRaw.actions_log,
      },
    })

    await sendDemoMessageSequence(phone, replyParts)

    for (const att of replyRaw.attachments) {
      try {
        const media = await attachmentMedia(att)
        if (!media) continue
        await sendDemoMedia(phone, {
          kind: att.kind,
          media,
          filename: att.filename,
          mime: att.mime,
          caption: att.caption,
        })
        await logDemoWebhook({
          step: 'whatsapp_attachment',
          level: 'success',
          message: `Adjunto enviado: ${att.filename}`,
          phone,
          demo_id: demo.demo_id,
        })
      } catch (attErr) {
        await logDemoWebhook({
          step: 'whatsapp_attachment',
          level: 'error',
          message: attErr instanceof Error ? attErr.message : 'Error adjunto',
          phone,
          demo_id: demo.demo_id,
        })
      }
    }

    await logDemoWebhook({
      step: 'done',
      level: 'success',
      message: `${replyParts.length} mensaje(s) enviados correctamente`,
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
