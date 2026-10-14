import { ingestMetaLeadgenChange } from '@/lib/integrations/meta/ingest'
import { claimDueMetaLeadEvents } from '@/lib/integrations/meta/store'
import type { MetaLeadgenChange } from '@/lib/integrations/meta/parse'

function changeFromEvent(row: {
  leadgen_id: string
  page_id: string | null
  form_id: string | null
  ad_id: string | null
  adset_id?: string | null
  payload: unknown
}): MetaLeadgenChange {
  const payload = row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : {}
  return {
    leadgen_id: row.leadgen_id,
    page_id: row.page_id || String(payload.page_id || ''),
    form_id: row.form_id || (typeof payload.form_id === 'string' ? payload.form_id : null),
    ad_id: row.ad_id || (typeof payload.ad_id === 'string' ? payload.ad_id : null),
    adgroup_id:
      row.adset_id ||
      (typeof payload.adgroup_id === 'string' ? payload.adgroup_id : null) ||
      (typeof payload.adset_id === 'string' ? payload.adset_id : null),
    created_time: typeof payload.created_time === 'string' ? payload.created_time : null,
  }
}

export async function retryDueMetaLeads(): Promise<{
  claimed: number
  processed: number
  failed: number
  ignored: number
}> {
  const due = await claimDueMetaLeadEvents(25)
  let processed = 0
  let failed = 0
  let ignored = 0
  for (const event of due) {
    const change = changeFromEvent(event)
    const result = await ingestMetaLeadgenChange(change, event.payload)
    if (result.status === 'processed') processed++
    else if (result.status === 'ignored') ignored++
    else failed++
  }
  return { claimed: due.length, processed, failed, ignored }
}
