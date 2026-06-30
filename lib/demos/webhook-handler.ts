import {
  findActiveDemoByPhone,
  getConversationMessages,
  saveConversationMessages,
} from './store'
import { normalizeWasenderPhone, phoneToWasenderRecipient } from './phone'
import { generateDemoReply } from './chat'
import { parseWasenderWebhook, sendWasenderTextMessage } from './wasender'

export async function handleDemoWasenderWebhook(body: unknown): Promise<{
  handled: boolean
  reason?: string
}> {
  const parsed = parseWasenderWebhook(body)
  if (!parsed) {
    return { handled: false, reason: 'payload_ignored' }
  }

  const phone = normalizeWasenderPhone(parsed.senderPhone)
  if (!phone) {
    return { handled: false, reason: 'invalid_phone' }
  }

  const demo = await findActiveDemoByPhone(phone)
  if (!demo) {
    return { handled: false, reason: 'no_active_demo' }
  }

  const history = await getConversationMessages(demo.demo_id, phone)
  const reply = await generateDemoReply(
    demo.prompt,
    demo.base_conocimiento,
    history,
    parsed.text
  )

  const now = new Date().toISOString()
  const updatedHistory = [
    ...history,
    { role: 'user' as const, content: parsed.text, at: now },
    { role: 'assistant' as const, content: reply, at: now },
  ]

  await saveConversationMessages(demo.demo_id, phone, updatedHistory)

  const recipient = phoneToWasenderRecipient(phone)
  await sendWasenderTextMessage(recipient, reply)

  return { handled: true }
}
