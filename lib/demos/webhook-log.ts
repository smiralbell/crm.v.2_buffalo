import { query } from '@/lib/db'

export type WebhookLogLevel = 'info' | 'warn' | 'error' | 'success'

export interface DemoWebhookLogRow {
  id: number
  step: string
  level: WebhookLogLevel
  message: string
  event: string | null
  phone: string | null
  demo_id: number | null
  details: Record<string, unknown> | null
  created_at: string
}

function safeJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  } catch {
    return null
  }
}

function truncatePayload(body: unknown, max = 4000): string {
  try {
    const s = JSON.stringify(body)
    return s.length > max ? `${s.slice(0, max)}…` : s
  } catch {
    return String(body).slice(0, max)
  }
}

export async function logDemoWebhook(input: {
  step: string
  level: WebhookLogLevel
  message: string
  event?: string | null
  phone?: string | null
  demo_id?: number | null
  details?: Record<string, unknown> | null
  raw_body?: unknown
}): Promise<void> {
  const details = {
    ...(input.details || {}),
    ...(input.raw_body !== undefined ? { payload_preview: truncatePayload(input.raw_body) } : {}),
  }

  const line = `[demos/webhook] [${input.level}] ${input.step}: ${input.message}`
  if (input.level === 'error') console.error(line, details)
  else if (input.level === 'warn') console.warn(line, details)
  else console.log(line, details)

  try {
    await query(
      `INSERT INTO demo_webhook_logs (step, level, message, event, phone, demo_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        input.step,
        input.level,
        input.message,
        input.event ?? null,
        input.phone ?? null,
        input.demo_id ?? null,
        JSON.stringify(safeJson(details) || {}),
      ]
    )
  } catch {
    // Tabla puede no existir aún
  }
}

export async function listDemoWebhookLogs(limit = 80): Promise<DemoWebhookLogRow[]> {
  try {
    const result = await query<{
      id: number
      step: string
      level: string
      message: string
      event: string | null
      phone: string | null
      demo_id: number | null
      details: Record<string, unknown> | string | null
      created_at: Date
    }>(
      `SELECT id, step, level, message, event, phone, demo_id, details, created_at
       FROM demo_webhook_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    )

    return result.rows.map((r) => ({
      id: r.id,
      step: r.step,
      level: r.level as WebhookLogLevel,
      message: r.message,
      event: r.event,
      phone: r.phone,
      demo_id: r.demo_id,
      details:
        typeof r.details === 'string'
          ? (JSON.parse(r.details) as Record<string, unknown>)
          : r.details,
      created_at:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : new Date(r.created_at).toISOString(),
    }))
  } catch {
    return []
  }
}
