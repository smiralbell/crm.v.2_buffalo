import { createHash } from 'crypto'
import { query } from '@/lib/db'
import { notify } from '@/lib/notifications'
import type { InboundProcessorResult } from '@/lib/ingest/types'
import {
  extractWebAttribution,
  normalizeWebFormPayload,
  parseWebFormSubmission,
} from '@/lib/marketing/web-form-submissions.types'
import { syncWebFormToPipeline } from '@/lib/pipelines/web'

export function webFormExternalId(payload: unknown): string {
  const item = normalizeWebFormPayload(payload)
  const c = item.cuerpo ?? {}
  const hint = [item.site, item.page, c.email, c.phone, c.timestamp, c.page_url]
    .filter(Boolean)
    .join('|')
  return `wf:${createHash('sha256').update(hint || JSON.stringify(payload ?? null)).digest('hex').slice(0, 32)}`
}

export async function processWebForm(payload: unknown): Promise<InboundProcessorResult> {
  const item = normalizeWebFormPayload(payload)
  const cuerpo = item.cuerpo ?? {}
  if (!cuerpo.email && !cuerpo.phone && !cuerpo.fullname) {
    return { status: 'ignored', result: { reason: 'empty' } }
  }

  const inserted = await query<{
    id: number
    payload: unknown
    estado: string
    notas: string | null
    responded_at: Date | null
    created_at: Date
  }>(
    `INSERT INTO web_form_submissions (payload, estado)
     VALUES ($1::jsonb, 'pendiente')
     RETURNING id, payload, estado, notas, responded_at, created_at`,
    [JSON.stringify(item)]
  )
  const db = inserted.rows[0]
  if (!db) throw new Error('No se pudo guardar el envío')
  const row = parseWebFormSubmission(db.id, db.payload, db)
  const attribution = extractWebAttribution(cuerpo)
  if (attribution) {
    try {
      await query(`UPDATE web_form_submissions SET attribution = $2::jsonb WHERE id = $1`, [
        row.id,
        JSON.stringify(attribution),
      ])
    } catch {
      /* columna 0005 pendiente */
    }
  }

  const cardId = await syncWebFormToPipeline({
    id: row.id,
    fullname: row.fullname,
    email: row.email,
    company: row.company,
    phone: row.phone,
    service: row.service,
    etiqueta: row.etiqueta,
    attribution,
  })

  await notify({
    to: { roles: ['admin'] },
    kind: 'lead.webform',
    title: `Formulario web: ${row.fullname || row.email || row.company || `#${row.id}`}`,
    body:
      [row.site, row.page, row.company, row.service, row.etiqueta].filter(Boolean).join(' · ') ||
      'Nuevo envío',
    link: '/marketing',
    severity: 'info',
    dedupeKey: `webform:${row.id}`,
  }).catch(() => undefined)

  return {
    status: 'processed',
    result: { submission_id: row.id, email: row.email, pipeline_card_id: cardId },
  }
}
