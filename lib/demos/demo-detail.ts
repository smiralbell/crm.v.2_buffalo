import { query } from '@/lib/db'
import { buildMetricsFromRows } from './metrics'
import type { DemoMetrics } from './types'
import { getDemoById } from './store'

export async function getDemoMetrics(demoId: number): Promise<DemoMetrics> {
  const conversations = await query<{
    numero_telefono: string
    messages: unknown
    updated_at: Date
  }>(
    `SELECT numero_telefono, messages, updated_at
     FROM demo_conversaciones
     WHERE demo_id = $1
     ORDER BY updated_at DESC`,
    [demoId]
  )

  let errorPhones = new Set<string>()
  try {
    const errors = await query<{ phone: string }>(
      `SELECT DISTINCT phone
       FROM demo_webhook_logs
       WHERE demo_id = $1 AND level = 'error' AND phone IS NOT NULL`,
      [demoId]
    )
    errorPhones = new Set(errors.rows.map((r) => r.phone))
  } catch {
    // sin tabla de logs
  }

  return buildMetricsFromRows(
    conversations.rows.map((r) => ({
      numero_telefono: r.numero_telefono,
      messages: r.messages as never,
      updated_at: r.updated_at,
    })),
    errorPhones
  )
}

export async function getDemoWithMetrics(demoId: number) {
  const demo = await getDemoById(demoId)
  if (!demo) return null
  const metrics = await getDemoMetrics(demoId)
  return { ...demo, metrics }
}
