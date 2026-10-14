import { prisma } from '@/lib/prisma'
import { logCrmActivity } from '@/lib/crm/activities'
import {
  getMetaPageConfig,
  isMetaPageAllowed,
  pageOrigen,
  pagePipelineId,
} from '@/lib/integrations/meta/config'
import { enrichMetaLeadAttribution, fetchMetaLeadFromGraph } from '@/lib/integrations/meta/graph'
import {
  formatMetaAnswers,
  formatMetaAttributionLines,
  mergeWebhookIntoLead,
  type MetaLeadgenChange,
  type ParsedMetaLead,
} from '@/lib/integrations/meta/parse'
import {
  markMetaLeadEvent,
  persistMetaLeadEvent,
  type MetaLeadEventRow,
} from '@/lib/integrations/meta/store'
import { BUFFALO_STAGE_COLORS, defaultStageColor } from '@/lib/pipelines/defaults'
import { alertMetaLead } from '@/lib/integrations/meta/alerts'
import { ensureWebContact, getWebPipelineId } from '@/lib/pipelines/web'

function leadNotes(parsed: ParsedMetaLead, origen: string): string {
  const lines = [
    `Origen: ${origen}`,
    ...formatMetaAttributionLines(parsed),
    `Meta leadgen: ${parsed.leadgen_id}`,
    formatMetaAnswers(parsed.answers),
  ].filter(Boolean)
  return lines.join('\n')
}

async function appendLeadNotes(leadId: number, leadgenId: string, block: string): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { notas: true } })
  if (!lead) return
  if (lead.notas?.includes(leadgenId)) return
  const next = [lead.notas?.trim(), block].filter(Boolean).join('\n\n')
  await prisma.lead.update({
    where: { id: leadId },
    data: { notas: next, ultima_interaccion: new Date() },
  })
}

async function nextCardPosition(pipelineId: string, stage: string): Promise<number> {
  const last = await prisma.pipelineCard.findFirst({
    where: { pipeline_id: pipelineId, stage, deleted_at: null },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  return last ? last.position + 1 : 0
}

async function resolveLeadStage(pipelineId: string): Promise<string | null> {
  const stages = await prisma.pipelineStage.findMany({
    where: { pipeline_id: pipelineId },
    select: { name: true },
    orderBy: { position: 'asc' },
  })
  const lead = stages.find((s) => /lead/i.test(s.name))
  return lead?.name || stages[0]?.name || null
}

async function syncMetaContactToPipeline(
  contactId: number,
  pageId: string,
  notes: string
): Promise<string | null> {
  const pipelineId = pagePipelineId(pageId) || (await getWebPipelineId())
  if (!pipelineId) return null
  let pipeline: { id: string } | null = null
  try {
    pipeline = await prisma.pipelineKanban.findUnique({
      where: { id: pipelineId },
      select: { id: true },
    })
  } catch {
    pipeline = null
  }
  if (!pipeline) {
    console.warn('[meta-leads] pipeline no encontrado', pipelineId)
    return null
  }
  const stage = await resolveLeadStage(pipelineId)
  if (!stage) return null

  const existing = await prisma.pipelineCard.findFirst({
    where: { pipeline_id: pipelineId, entity_id: String(contactId), deleted_at: null },
  })
  const tags = ['meta', 'meta-lead-ads']
  if (existing) {
    const merged = Array.from(new Set([...existing.tags, ...tags]))
    await prisma.pipelineCard.update({
      where: { id: existing.id },
      data: { tags: merged, notes: notes.trim() || existing.notes },
    })
    return existing.id
  }
  const card = await prisma.pipelineCard.create({
    data: {
      pipeline_id: pipelineId,
      entity_id: String(contactId),
      entity_type: 'contact',
      stage,
      stage_color: BUFFALO_STAGE_COLORS[stage] || defaultStageColor(stage),
      position: await nextCardPosition(pipelineId, stage),
      tags,
      notes: notes.trim() || null,
      capture_date: new Date(),
    },
  })
  return card.id
}

export async function upsertMetaLeadInCrm(
  parsed: ParsedMetaLead,
  change: MetaLeadgenChange
): Promise<{ contactId: number; leadId: number }> {
  const origen = pageOrigen(change.page_id)
  const { contactId, leadId } = await ensureWebContact({
    nombre: parsed.nombre,
    email: parsed.email,
    telefono: parsed.telefono,
    empresa: parsed.empresa,
    origen,
  })
  const notes = leadNotes(parsed, origen)
  await appendLeadNotes(leadId, parsed.leadgen_id, notes)
  await logCrmActivity({
    contactId,
    leadId,
    kind: 'origin',
    title: 'Lead de Meta Ads',
    body: notes,
    meta: {
      source: 'meta_lead_ads',
      leadgen_id: parsed.leadgen_id,
      page_id: parsed.page_id || change.page_id,
      page_name: parsed.page_name,
      platform: parsed.platform,
      is_organic: parsed.is_organic,
      form_id: parsed.form_id,
      form_name: parsed.form_name,
      campaign_id: parsed.campaign_id,
      campaign_name: parsed.campaign_name,
      adset_id: parsed.adset_id,
      adset_name: parsed.adset_name,
      ad_id: parsed.ad_id,
      ad_name: parsed.ad_name,
      answers: parsed.answers,
    },
    createdBy: 'meta-lead-ads',
  })
  await syncMetaContactToPipeline(contactId, change.page_id, notes)
  return { contactId, leadId }
}

export async function processPersistedMetaEvent(
  event: MetaLeadEventRow,
  change: MetaLeadgenChange
): Promise<{ status: 'processed' | 'ignored' | 'failed'; contactId?: number; leadId?: number; error?: string }> {
  const cfg = getMetaPageConfig()
  if (!isMetaPageAllowed(change.page_id || event.page_id || '', cfg)) {
    await markMetaLeadEvent(event.id, {
      status: 'ignored',
      last_error: 'page_id no permitido (META_ALLOWED_PAGE_IDS)',
    })
    return { status: 'ignored' }
  }
  try {
    const pageId = change.page_id || event.page_id || ''
    const { lead: fetched, raw } = await fetchMetaLeadFromGraph(change.leadgen_id, pageId, cfg)
    const merged = mergeWebhookIntoLead(fetched, { ...change, page_id: pageId })
    let lead = merged
    try {
      lead = await enrichMetaLeadAttribution(merged, pageId, cfg)
    } catch {
      lead = merged
    }
    const saved = await upsertMetaLeadInCrm(lead, { ...change, page_id: pageId })
    await markMetaLeadEvent(event.id, {
      status: 'processed',
      graph_payload: raw,
      contact_id: saved.contactId,
      lead_id: saved.leadId,
      last_error: null,
      attribution: lead,
    })
    void alertMetaLead({ lead, leadId: saved.leadId })
    return { status: 'processed', contactId: saved.contactId, leadId: saved.leadId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error Graph/CRM'
    await markMetaLeadEvent(event.id, {
      status: 'failed',
      last_error: msg.slice(0, 2000),
      bumpAttempt: true,
    })
    return { status: 'failed', error: msg }
  }
}

export async function ingestMetaLeadgenChange(
  change: MetaLeadgenChange,
  payload: unknown
): Promise<{
  saved: true
  duplicate: boolean
  status: string
  contactId?: number
  leadId?: number
  error?: string
}> {
  const persisted = await persistMetaLeadEvent(change, payload)
  if (persisted.action === 'skip_processed') {
    return {
      saved: true,
      duplicate: true,
      status: persisted.event.status,
      contactId: persisted.event.contact_id ?? undefined,
      leadId: persisted.event.lead_id ?? undefined,
    }
  }
  const processed = await processPersistedMetaEvent(persisted.event, change)
  return {
    saved: true,
    duplicate: persisted.duplicate,
    status: processed.status,
    contactId: processed.contactId,
    leadId: processed.leadId,
    error: processed.error,
  }
}
