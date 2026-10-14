import { createHash } from 'crypto'
import type { InboundProcessorResult } from '@/lib/ingest/types'
import { handleDemoWasenderWebhook } from '@/lib/demos/webhook-handler'
import { parseWasenderWebhook } from '@/lib/demos/wasender'

export function wasenderExternalId(payload: unknown): string {
  const parsed = parseWasenderWebhook(payload)
  if (parsed.ok && parsed.data.messageId) return `wa:${parsed.data.messageId}`
  return `wa:${createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex').slice(0, 32)}`
}

export async function processWhatsapp(payload: unknown): Promise<InboundProcessorResult> {
  const result = await handleDemoWasenderWebhook(payload)
  if (!result.handled) return { status: 'ignored', result: { reason: result.reason || 'ignored' } }
  return { status: 'processed', result: { replied: true } }
}

export function retellFromNumber(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const inbound = root.call_inbound
  if (inbound && typeof inbound === 'object') {
    const from = (inbound as Record<string, unknown>).from_number
    if (typeof from === 'string' && from.trim()) return from.trim()
  }
  if (typeof root.from_number === 'string' && root.from_number.trim()) return root.from_number.trim()
  return null
}

export async function processRetell(payload: unknown): Promise<InboundProcessorResult> {
  const from = retellFromNumber(payload)
  return { status: from ? 'processed' : 'ignored', result: { from_number: from, routed_in_webhook: true } }
}
