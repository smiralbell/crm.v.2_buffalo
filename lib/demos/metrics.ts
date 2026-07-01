import type { DemoMessage, DemoMetrics, DemoSessionRow, DemoSessionStatus } from './types'

function parseMessages(raw: DemoMessage[] | string): DemoMessage[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      return Array.isArray(p) ? (p as DemoMessage[]) : []
    } catch {
      return []
    }
  }
  return []
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 4) return phone
  const suffix = digits.slice(-3)
  const prefix = phone.startsWith('+') ? `+${digits.slice(0, 2)}` : digits.slice(0, 2)
  return `${prefix} *** **${suffix}`
}

export function classifySession(
  messages: DemoMessage[],
  hadWebhookError: boolean
): DemoSessionStatus {
  const user = messages.filter((m) => m.role === 'user').length
  const assistant = messages.filter((m) => m.role === 'assistant').length

  if (hadWebhookError && assistant === 0) return 'error'
  if (user > 0 && assistant === 0) return 'error'
  if (assistant > 0) return 'ok'
  return 'pending'
}

export function buildMetricsFromRows(
  conversations: Array<{
    numero_telefono: string
    messages: DemoMessage[] | string
    updated_at: Date | string
  }>,
  errorPhones: Set<string>
): DemoMetrics {
  const sessions: DemoSessionRow[] = []
  let totalUser = 0
  let totalAssistant = 0
  let successful = 0
  let failed = 0
  let lastActivity: string | null = null

  for (const row of conversations) {
    const messages = parseMessages(row.messages)
    const user = messages.filter((m) => m.role === 'user').length
    const assistant = messages.filter((m) => m.role === 'assistant').length
    const hadError = errorPhones.has(row.numero_telefono)
    const status = classifySession(messages, hadError)

    totalUser += user
    totalAssistant += assistant
    if (status === 'ok') successful++
    if (status === 'error') failed++

    const updated =
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString()
    if (!lastActivity || updated > lastActivity) lastActivity = updated

    if (user > 0 || assistant > 0) {
      sessions.push({
        phone: row.numero_telefono,
        phone_masked: maskPhone(row.numero_telefono),
        user_messages: user,
        assistant_messages: assistant,
        status,
        updated_at: updated,
      })
    }
  }

  sessions.sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  return {
    testers_count: sessions.length,
    successful_count: successful,
    failed_count: failed,
    total_user_messages: totalUser,
    total_assistant_messages: totalAssistant,
    last_activity_at: lastActivity,
    sessions,
  }
}
