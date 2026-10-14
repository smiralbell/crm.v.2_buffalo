import { createHash } from 'crypto'
import { query } from '@/lib/db'
import type { InboundProcessorResult } from '@/lib/ingest/types'

function asRec(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

export function instantlyEventType(payload: unknown): string {
  const b = asRec(payload)
  return str(b.type) || str(b.event_type) || 'unknown'
}

export function instantlyExternalId(payload: unknown): string {
  const b = asRec(payload)
  const id = str(b.id) || str(b.event_id) || str(b.eventId)
  if (id) return `ins:${id}`
  return `ins:${createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex').slice(0, 32)}`
}

export async function processInstantly(payload: unknown): Promise<InboundProcessorResult> {
  const b = asRec(payload)
  const eventType = instantlyEventType(payload)
  const email = str(b.email) || str(b.recipient)
  const campaignId = str(b.campaign_id) || str(b.campaign)
  const campaignName = str(b.campaign_name)
  const status = str(b.status) || str(b.state)
  try {
    await query(
      `INSERT INTO instantly_webhooks (event_type, email, campaign_id, campaign_name, payload, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [eventType, email, campaignId, campaignName, JSON.stringify(payload ?? null), status]
    )
  } catch (e) {
    if (e && typeof e === 'object' && (e as { code?: string }).code === '42P01') {
      // tabla antigua aún no creada: el evento ya está en inbound_events
    } else {
      throw e
    }
  }
  return { status: 'processed', result: { event: eventType, email } }
}
