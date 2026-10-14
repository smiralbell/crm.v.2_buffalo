import { prisma } from '@/lib/prisma'
import { parseGraphLead, type MetaFieldAnswer } from '@/lib/integrations/meta/parse'
import { ensureMetaLeadEventsTable } from '@/lib/integrations/meta/store'

function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number)
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
  const end = new Date(y, m, 0, 23, 59, 59, 999)
  return { start, end }
}

export type MetaAdsLeadRow = {
  id: number
  leadgen_id: string
  page_id: string | null
  page_name: string | null
  platform: string | null
  status: string
  created_at: string
  processed_at: string | null
  last_error: string | null
  contact_id: number | null
  lead_id: number | null
  nombre: string | null
  email: string | null
  telefono: string | null
  empresa: string | null
  campaign_id: string | null
  campaign_name: string | null
  adset_id: string | null
  adset_name: string | null
  ad_id: string | null
  ad_name: string | null
  form_id: string | null
  form_name: string | null
  answers: MetaFieldAnswer[]
  lead_estado: string | null
}

export type MetaAdsLeadsSummary = {
  total: number
  processed: number
  pending: number
  failed: number
  ignored: number
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function fromGraph(leadgenId: string, graph: unknown): ReturnType<typeof parseGraphLead> | null {
  if (!graph) return null
  try {
    return parseGraphLead(leadgenId, graph)
  } catch {
    return null
  }
}

export async function listMetaAdsLeads(
  period: string,
  limit = 300,
  campaignId?: string
): Promise<{ rows: MetaAdsLeadRow[]; summary: MetaAdsLeadsSummary; period: string }> {
  await ensureMetaLeadEventsTable()
  const { start, end } = periodBounds(period)
  const cap = Math.max(1, Math.min(500, Math.floor(limit)))
  const campaign = campaignId?.trim() || null

  const events = await prisma.$queryRawUnsafe<
    {
      id: number
      leadgen_id: string
      page_id: string | null
      page_name: string | null
      platform: string | null
      form_id: string | null
      form_name: string | null
      ad_id: string | null
      ad_name: string | null
      adset_id: string | null
      adset_name: string | null
      campaign_id: string | null
      campaign_name: string | null
      status: string
      last_error: string | null
      contact_id: number | null
      lead_id: number | null
      graph_payload: unknown
      created_at: Date
      processed_at: Date | null
    }[]
  >(
    `SELECT id, leadgen_id, page_id, page_name, platform, form_id, form_name,
            ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name,
            status, last_error, contact_id, lead_id, graph_payload, created_at, processed_at
       FROM meta_lead_events
      WHERE created_at >= $1 AND created_at <= $2
        AND ($4::text IS NULL OR campaign_id = $4)
      ORDER BY created_at DESC
      LIMIT $3`,
    start,
    end,
    cap,
    campaign
  )

  const contactIds = Array.from(new Set(events.map((e) => e.contact_id).filter((id): id is number => !!id)))
  const leadIds = Array.from(new Set(events.map((e) => e.lead_id).filter((id): id is number => !!id)))

  const [contacts, leads] = await Promise.all([
    contactIds.length
      ? prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, nombre: true, email: true, telefono: true, empresa: true },
        })
      : Promise.resolve([]),
    leadIds.length
      ? prisma.lead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, estado: true, contact_id: true },
        })
      : Promise.resolve([]),
  ])

  const contactById = new Map(contacts.map((c) => [c.id, c]))
  const leadById = new Map(leads.map((l) => [l.id, l]))

  const rows: MetaAdsLeadRow[] = events.map((e) => {
    const parsed = fromGraph(e.leadgen_id, e.graph_payload)
    const contact = e.contact_id ? contactById.get(e.contact_id) : null
    const lead = e.lead_id ? leadById.get(e.lead_id) : null
    const payload = asRecord(e.graph_payload)
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    return {
      id: e.id,
      leadgen_id: e.leadgen_id,
      page_id: e.page_id,
      page_name: e.page_name || parsed?.page_name || null,
      platform: e.platform || parsed?.platform || str(payload?.platform),
      status: e.status,
      created_at: e.created_at.toISOString(),
      processed_at: e.processed_at ? e.processed_at.toISOString() : null,
      last_error: e.last_error,
      contact_id: e.contact_id,
      lead_id: e.lead_id,
      nombre: contact?.nombre || parsed?.nombre || null,
      email: contact?.email || parsed?.email || null,
      telefono: contact?.telefono || parsed?.telefono || null,
      empresa: contact?.empresa || parsed?.empresa || null,
      campaign_id: e.campaign_id || parsed?.campaign_id || str(payload?.campaign_id),
      campaign_name: e.campaign_name || parsed?.campaign_name || str(payload?.campaign_name),
      adset_id: e.adset_id || parsed?.adset_id || str(payload?.adset_id),
      adset_name: e.adset_name || parsed?.adset_name || str(payload?.adset_name),
      ad_id: e.ad_id || parsed?.ad_id || str(payload?.ad_id),
      ad_name: e.ad_name || parsed?.ad_name || str(payload?.ad_name),
      form_id: e.form_id || parsed?.form_id || str(payload?.form_id),
      form_name: e.form_name || parsed?.form_name || str(payload?.form_name),
      answers: parsed?.answers || [],
      lead_estado: lead?.estado || null,
    }
  })

  const summary: MetaAdsLeadsSummary = {
    total: rows.length,
    processed: rows.filter((r) => r.status === 'processed').length,
    pending: rows.filter((r) => r.status === 'pending').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    ignored: rows.filter((r) => r.status === 'ignored').length,
  }

  return { rows, summary, period }
}
