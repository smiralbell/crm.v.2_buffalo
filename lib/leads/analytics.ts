import { prisma } from '@/lib/prisma'
import { isCalBookingsTableAvailable } from '@/lib/marketing/cal-bookings'
import { query } from '@/lib/db'
import { resolveChannelSpend } from '@/lib/leads/channel-costs'
import {
  getGlobalPipelineId,
  isReunionStageName,
} from '@/lib/pipelines/global-funnel'
import {
  CHANNEL_LABELS,
  type ChannelBreakdownRow,
  type ChannelKey,
  type ChannelRentabilityInsight,
  type ColdCallFunnel,
  type LeadListItem,
  type LeadsAnalytics,
  type TimelinePoint,
} from '@/lib/leads/analytics.types'

export type {
  ChannelBreakdownRow,
  ChannelKey,
  ChannelRentabilityInsight,
  ColdCallFunnel,
  LeadListItem,
  LeadsAnalytics,
  TimelinePoint,
} from '@/lib/leads/analytics.types'

export {
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  currentPeriod,
} from '@/lib/leads/analytics.types'

export function normalizeChannel(origen: string | null | undefined): ChannelKey {
  const o = (origen || '').trim().toLowerCase()
  if (!o) return 'unknown'
  if (o.includes('cold') || o === 'coldcall') return 'cold_calling'
  if (o.includes('email') || o.includes('mail_marketing') || o.includes('newsletter')) return 'email'
  if (
    o.includes('web') ||
    o.includes('form') ||
    o.includes('chat') ||
    o.includes('landing') ||
    o.includes('widget') ||
    o.includes('cal')
  ) {
    return 'web'
  }
  if (o.includes('insta')) return 'instagram'
  if (o.includes('whats')) return 'whatsapp'
  if (o.includes('refer')) return 'referral'
  return 'other'
}

export function periodBounds(period: string): { start: Date; end: Date; label: string } {
  const [y, m] = period.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) {
    const now = new Date()
    return periodBounds(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  }
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
  const end = new Date(y, m, 0, 23, 59, 59, 999)
  const label = start.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return { start, end, label }
}

function pct(num: number, den: number): number {
  if (den <= 0) return 0
  return Math.round((num / den) * 1000) / 10
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

/**
 * Leads «en reuniones» = tarjetas en columna REUNIÓN del pipeline global
 * (misma fuente que el embudo general). No usa leads.estado (puede quedar desfasado).
 */
async function loadScheduledLeadIds(): Promise<Set<number>> {
  const ids = new Set<number>()
  const globalId = await getGlobalPipelineId()
  if (!globalId) return ids

  try {
    const cards = await prisma.pipelineCard.findMany({
      where: {
        pipeline_id: globalId,
        deleted_at: null,
        entity_type: 'contact',
      },
      select: { entity_id: true, stage: true },
    })

    const contactIds = Array.from(
      new Set(
        cards
          .filter((c) => isReunionStageName(c.stage))
          .map((c) => Number(c.entity_id))
          .filter((n) => Number.isFinite(n) && n > 0)
      )
    )
    if (contactIds.length === 0) return ids

    const leads = await prisma.lead.findMany({
      where: { contact_id: { in: contactIds } },
      select: { id: true, contact_id: true, estado: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
    })

    // Un lead por contacto (prioriza estado reunión si hay varios)
    const byContact = new Map<number, (typeof leads)[number]>()
    for (const lead of leads) {
      if (lead.contact_id == null) continue
      const prev = byContact.get(lead.contact_id)
      if (!prev) {
        byContact.set(lead.contact_id, lead)
        continue
      }
      if (prev.estado !== 'reunion' && lead.estado === 'reunion') {
        byContact.set(lead.contact_id, lead)
      }
    }
    for (const lead of Array.from(byContact.values())) {
      ids.add(lead.id)
    }
  } catch {
    // pipeline_cards / global id may be unavailable
  }

  return ids
}

/**
 * Reuniones de calendario YA CELEBRADAS en el periodo
 * (start_time ≤ ahora; no cuenta citas futuras del mes en curso).
 */
async function loadMeetingLeadIds(start: Date, end: Date): Promise<{
  meetingCount: number
  leadIds: number[]
}> {
  const leadIds = new Set<number>()
  let meetingCount = 0
  const now = new Date()
  const effectiveEnd = end.getTime() < now.getTime() ? end : now

  if (await isCalBookingsTableAvailable()) {
    try {
      const { rows } = await query<{ lead_id: number; n: number }>(
        `SELECT l.id AS lead_id, COUNT(*)::int AS n
         FROM cal_bookings b
         INNER JOIN contacts c
           ON c.email IS NOT NULL
          AND b.attendee_email IS NOT NULL
          AND LOWER(TRIM(c.email)) = LOWER(TRIM(b.attendee_email))
         INNER JOIN leads l ON l.contact_id = c.id
         WHERE b.start_time IS NOT NULL
           AND b.start_time >= $1
           AND b.start_time <= $2
           AND COALESCE(b.status, '') NOT IN ('cancelled', 'canceled', 'rejected')
         GROUP BY l.id`,
        [start, effectiveEnd]
      )
      for (const r of rows) {
        leadIds.add(r.lead_id)
        meetingCount += Number(r.n) || 0
      }
    } catch {
      try {
        // Fallback si falta start_time: solo booked_at ya pasado
        const { rows } = await query<{ lead_id: number; n: number }>(
          `SELECT l.id AS lead_id, COUNT(*)::int AS n
           FROM cal_bookings b
           INNER JOIN contacts c
             ON c.email IS NOT NULL
            AND b.attendee_email IS NOT NULL
            AND LOWER(TRIM(c.email)) = LOWER(TRIM(b.attendee_email))
           INNER JOIN leads l ON l.contact_id = c.id
           WHERE b.booked_at >= $1
             AND b.booked_at <= $2
             AND COALESCE(b.status, '') NOT IN ('cancelled', 'canceled', 'rejected')
           GROUP BY l.id`,
          [start, effectiveEnd]
        )
        for (const r of rows) {
          leadIds.add(r.lead_id)
          meetingCount += Number(r.n) || 0
        }
      } catch {
        // ignore
      }
    }
  }

  // Cold calling: reuniones cuya fecha ya ha pasado (o es hoy)
  try {
    const rows = await prisma.$queryRawUnsafe<{ lead_id: number; n: number }[]>(
      `
      SELECT l.id AS lead_id, COUNT(*)::int AS n
      FROM coldcall_calls cc
      INNER JOIN coldcall_prospects p ON p.id = cc.prospect_id
      INNER JOIN contacts c
        ON (
          (p.email IS NOT NULL AND c.email IS NOT NULL AND LOWER(TRIM(c.email)) = LOWER(TRIM(p.email)))
          OR (p.telefono IS NOT NULL AND c.telefono IS NOT NULL AND regexp_replace(p.telefono, '\\D', '', 'g') = regexp_replace(c.telefono, '\\D', '', 'g'))
        )
      INNER JOIN leads l ON l.contact_id = c.id
      WHERE cc.resultado = 'reunion_agendada'
        AND COALESCE(cc.reunion_fecha, cc.fecha) >= $1
        AND COALESCE(cc.reunion_fecha, cc.fecha) <= $2
      GROUP BY l.id
      `,
      start,
      effectiveEnd
    )
    for (const r of rows) {
      leadIds.add(r.lead_id)
      meetingCount += Number(r.n) || 0
    }
  } catch {
    // schema may differ
  }

  return { meetingCount, leadIds: Array.from(leadIds) }
}

async function hydrateLeadItems(
  ids: number[],
  channelByLead?: Map<number, ChannelKey>
): Promise<LeadListItem[]> {
  if (ids.length === 0) return []
  const unique = Array.from(new Set(ids))
  const rows = await prisma.lead.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      origen_principal: true,
      created_at: true,
      contact: {
        select: { nombre: true, email: true, empresa: true },
      },
    },
    orderBy: { created_at: 'desc' },
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  return unique
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => {
      const channel = channelByLead?.get(r.id) ?? normalizeChannel(r.origen_principal)
      return {
        id: r.id,
        name: r.contact?.nombre || r.contact?.email || `Lead #${r.id}`,
        empresa: r.contact?.empresa || null,
        email: r.contact?.email || null,
        channel,
        channel_label: CHANNEL_LABELS[channel],
        created_at: r.created_at?.toISOString() ?? null,
      }
    })
}

async function loadSetupPaymentLeads(start: Date, end: Date): Promise<{
  firstPaidInPeriod: number[]
  closedInPeriod: number[]
  firstPaidAny: Set<number>
  closedAny: Set<number>
  firstPaidEurByLead: Map<number, number>
  secondPaidEurByLead: Map<number, number>
}> {
  const firstPaidInPeriod: number[] = []
  const closedInPeriod: number[] = []
  const firstPaidAny = new Set<number>()
  const closedAny = new Set<number>()
  const secondPaidAny = new Set<number>()
  const firstPaidEurByLead = new Map<number, number>()
  const secondPaidEurByLead = new Map<number, number>()
  const projectByLead = new Map<
    number,
    { status: string | null; fecha_fin_real: Date | null }
  >()

  try {
    type PayRow = {
      lead_id: number
      payment_n: number | string
      paid_date: Date | string | null
      proyecto_status: string | null
      fecha_fin_real: Date | string | null
      invoice_eur: number | string | null
    }

    const rows = await prisma.$queryRawUnsafe<PayRow[]>(
      `
      WITH setup_paid AS (
        SELECT
          l.id AS lead_id,
          p.status AS proyecto_status,
          p.fecha_fin_real,
          COALESCE(bt.date, i.issue_date) AS paid_date,
          COALESCE(i.subtotal, i.total, 0)::float8 AS invoice_eur,
          ROW_NUMBER() OVER (
            PARTITION BY l.id
            ORDER BY COALESCE(bt.date, i.issue_date) NULLS LAST, i.issue_date, i.id
          ) AS payment_n
        FROM invoices i
        INNER JOIN bank_transactions bt ON bt.id = i.bank_transaction_id
        INNER JOIN contacts c
          ON c.email IS NOT NULL
         AND i.client_email IS NOT NULL
         AND LOWER(TRIM(c.email)) = LOWER(TRIM(i.client_email))
        INNER JOIN leads l ON l.contact_id = c.id
        LEFT JOIN LATERAL (
          SELECT p.status, p.fecha_fin_real
          FROM proyectos p
          WHERE p.lead_id = l.id
            AND p.es_buffalo = TRUE
          ORDER BY
            CASE WHEN p.status = 'active' THEN 0 ELSE 1 END,
            p.updated_at DESC NULLS LAST
          LIMIT 1
        ) p ON TRUE
        WHERE i.deleted_at IS NULL
          AND COALESCE(i.invoice_source, 'client') = 'client'
          AND COALESCE(i.status, '') <> 'cancelled'
          AND i.bank_transaction_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(i.services) = 'array' THEN i.services ELSE '[]'::jsonb END
            ) s(elem)
            WHERE LOWER(COALESCE(s.elem->>'description', ''))
              ~ '(manteniment|mensualitat|mensualidad|retell|twilio|cloud|connect)'
          )
      )
      SELECT lead_id, payment_n, paid_date, proyecto_status, fecha_fin_real, invoice_eur
      FROM setup_paid
      WHERE payment_n IN (1, 2)
      `
    )

    const startMs = start.getTime()
    const endMs = end.getTime()

    for (const r of rows) {
      const paymentN = Number(r.payment_n)
      const paid =
        r.paid_date instanceof Date
          ? r.paid_date
          : r.paid_date
            ? new Date(r.paid_date)
            : null
      const paidMs = paid && !Number.isNaN(paid.getTime()) ? paid.getTime() : null
      const inPeriod = paidMs != null && paidMs >= startMs && paidMs <= endMs
      const eur = Number(r.invoice_eur) || 0

      const fin =
        r.fecha_fin_real instanceof Date
          ? r.fecha_fin_real
          : r.fecha_fin_real
            ? new Date(r.fecha_fin_real)
            : null
      projectByLead.set(r.lead_id, {
        status: r.proyecto_status,
        fecha_fin_real: fin && !Number.isNaN(fin.getTime()) ? fin : null,
      })

      if (paymentN === 1) {
        firstPaidAny.add(r.lead_id)
        firstPaidEurByLead.set(r.lead_id, eur)
        if (inPeriod) firstPaidInPeriod.push(r.lead_id)
      }
      if (paymentN === 2) {
        secondPaidAny.add(r.lead_id)
        secondPaidEurByLead.set(r.lead_id, eur)
      }
    }

    for (const leadId of Array.from(secondPaidAny)) {
      const proj = projectByLead.get(leadId)
      const finished = proj?.status === 'active' && proj.fecha_fin_real != null
      if (!finished || !proj?.fecha_fin_real) continue
      closedAny.add(leadId)
      const finMs = proj.fecha_fin_real.getTime()
      if (finMs >= startMs && finMs <= endMs) {
        closedInPeriod.push(leadId)
      }
    }
  } catch (err) {
    console.warn('[leads/analytics] setup payments query failed', err)
  }

  return {
    firstPaidInPeriod: Array.from(new Set(firstPaidInPeriod)),
    closedInPeriod: Array.from(new Set(closedInPeriod)),
    firstPaidAny,
    closedAny,
    firstPaidEurByLead,
    secondPaidEurByLead,
  }
}

async function loadPipelineEurByLead(leadIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  if (leadIds.length === 0) return map
  try {
    const rows = await prisma.$queryRawUnsafe<{ lead_id: number; pipeline_eur: number }[]>(
      `
      SELECT
        l.id AS lead_id,
        COALESCE(p.setup_fee_eur, l.valor, 0)::float8 AS pipeline_eur
      FROM leads l
      LEFT JOIN LATERAL (
        SELECT setup_fee_eur
        FROM proyectos
        WHERE lead_id = l.id
          AND es_buffalo = TRUE
        ORDER BY
          CASE WHEN status = 'active' THEN 0 ELSE 1 END,
          updated_at DESC NULLS LAST
        LIMIT 1
      ) p ON TRUE
      WHERE l.id = ANY($1::int[])
      `,
      leadIds
    )
    for (const r of rows) {
      map.set(r.lead_id, Number(r.pipeline_eur) || 0)
    }
  } catch (err) {
    console.warn('[leads/analytics] pipeline eur query failed', err)
  }
  return map
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function ratioOrNull(num: number, den: number): number | null {
  if (den <= 0) return null
  return roundMoney(num / den)
}

function roiPct(revenue: number, spend: number): number | null {
  if (spend <= 0) return null
  return round1(((revenue - spend) / spend) * 100)
}

function pickBestChannel(rows: ChannelBreakdownRow[]): ChannelRentabilityInsight | null {
  const candidates = rows.filter((r) => r.channel !== 'unknown' && (r.leads > 0 || r.spend_eur > 0))
  if (!candidates.length) return null

  const withRoi = candidates.filter(
    (r) => r.spend_eur > 0 && r.eur_per_euro_clients != null && r.won_eur > 0
  )
  if (withRoi.length) {
    const ranked = [...withRoi].sort((a, b) => {
      const diff = (b.eur_per_euro_clients || 0) - (a.eur_per_euro_clients || 0)
      if (diff !== 0) return diff
      return (b.return_pct ?? -999) - (a.return_pct ?? -999)
    })
    const best = ranked[0]
    return {
      channel: best.channel,
      label: best.label,
      leads: best.leads,
      clients: best.clients,
      won_eur: best.won_eur,
      pipeline_eur: best.pipeline_eur,
      spend_eur: best.spend_eur,
      eur_per_lead: best.eur_per_lead,
      eur_per_euro_clients: best.eur_per_euro_clients,
      return_pct: best.return_pct,
      conversion_pct: best.lead_to_client_pct,
      method: 'roi_clients',
      reason: `Mejor retorno sobre inversión: ${best.eur_per_euro_clients?.toLocaleString('es-ES')} € cobrados por cada € invertido (ROI ${best.return_pct?.toLocaleString('es-ES')}%).`,
    }
  }

  const withWon = candidates.filter((r) => r.won_eur > 0)
  if (withWon.length) {
    const ranked = [...withWon].sort((a, b) => b.eur_per_lead - a.eur_per_lead)
    const best = ranked[0]
    return {
      channel: best.channel,
      label: best.label,
      leads: best.leads,
      clients: best.clients,
      won_eur: best.won_eur,
      pipeline_eur: best.pipeline_eur,
      spend_eur: best.spend_eur,
      eur_per_lead: best.eur_per_lead,
      eur_per_euro_clients: best.eur_per_euro_clients,
      return_pct: best.return_pct,
      conversion_pct: best.lead_to_client_pct,
      method: 'won_eur_per_lead',
      reason: `Sin coste comparable en todos los canales; lidera por € cobrados por lead (${best.eur_per_lead.toLocaleString('es-ES')} €).`,
    }
  }

  const withConv = candidates.filter((r) => r.clients > 0)
  if (withConv.length) {
    const ranked = [...withConv].sort((a, b) => b.lead_to_client_pct - a.lead_to_client_pct)
    const best = ranked[0]
    return {
      channel: best.channel,
      label: best.label,
      leads: best.leads,
      clients: best.clients,
      won_eur: best.won_eur,
      pipeline_eur: best.pipeline_eur,
      spend_eur: best.spend_eur,
      eur_per_lead: best.eur_per_lead,
      eur_per_euro_clients: best.eur_per_euro_clients,
      return_pct: best.return_pct,
      conversion_pct: best.lead_to_client_pct,
      method: 'conversion',
      reason: `Aún sin cobros atribuibles; lidera por conversión lead → cliente (${best.lead_to_client_pct.toLocaleString('es-ES')}%).`,
    }
  }

  const ranked = [...candidates].sort((a, b) => {
    const aPipe = a.pipeline_eur / Math.max(a.leads, 1)
    const bPipe = b.pipeline_eur / Math.max(b.leads, 1)
    return bPipe - aPipe
  })
  const best = ranked[0]
  if (best.pipeline_eur <= 0) return null
  return {
    channel: best.channel,
    label: best.label,
    leads: best.leads,
    clients: best.clients,
    won_eur: best.won_eur,
    pipeline_eur: best.pipeline_eur,
    spend_eur: best.spend_eur,
    eur_per_lead: round1(best.pipeline_eur / Math.max(best.leads, 1)),
    eur_per_euro_clients: best.eur_per_euro_clients,
    return_pct: best.return_pct,
    conversion_pct: best.lead_to_client_pct,
    method: 'pipeline_per_lead',
    reason: `Sin cobros ni ROI aún; mayor valor de pipeline por lead.`,
  }
}

function buildSuggestions(input: {
  kpis: LeadsAnalytics['kpis']
  by_channel: ChannelBreakdownRow[]
  cold: ColdCallFunnel
}): string[] {
  const tips: string[] = []
  const unknown = input.by_channel.find((c) => c.channel === 'unknown')
  if (unknown && unknown.leads > 0) {
    tips.push(
      `${unknown.leads} leads sin origen — rellena origen_principal para que el desglose por canal sea fiable.`
    )
  }
  if (input.kpis.leads_total > 0 && input.kpis.scheduled_pct < 15) {
    tips.push(
      'Pocos leads agendan reunión este mes. Revisa fricción en Cal.com / follow-up tras formulario o chat.'
    )
  }
  if (input.cold.available && input.cold.calls > 20 && input.cold.call_to_lead_pct < 5) {
    tips.push(
      'Cold calling: muchas llamadas y pocos leads CRM. Revisa calidad de lista o criterio de “lead real”.'
    )
  }
  if (input.kpis.clients_won > 0 && input.kpis.clients_closed === 0) {
    tips.push(
      'Hay clientes ganados (1ª factura) pero ninguno cerrado (2ª factura + producción). Revisa cobros finales y “Finalizar” proyecto.'
    )
  }
  tips.push(
    'Cliente ganado = 1ª factura de setup cobrada. Cliente cerrado = 2ª factura cobrada + proyecto finalizado en producción (cuenta el mes de fecha fin real).'
  )
  return tips
}

async function loadColdCallFunnel(
  start: Date,
  end: Date,
  coldLeadItems: LeadListItem[],
  coldClientItems: LeadListItem[],
  coldClosedItems: LeadListItem[]
): Promise<ColdCallFunnel> {
  try {
    const callsRows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
      FROM coldcall_calls
      WHERE fecha >= ${start} AND fecha <= ${end}
    `
    const meetingsRows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
      FROM coldcall_calls
      WHERE fecha >= ${start} AND fecha <= ${end}
        AND resultado = 'reunion_agendada'
    `
    const calls = Number(callsRows[0]?.n || 0)
    const meetings = Number(meetingsRows[0]?.n || 0)
    const leads = coldLeadItems.length
    const clients = coldClientItems.length
    return {
      available: true,
      calls,
      meetings,
      leads,
      clients,
      closed: coldClosedItems.length,
      call_to_lead_pct: pct(leads, calls),
      lead_to_client_pct: pct(clients, leads),
      call_to_client_pct: pct(clients, calls),
      meeting_to_lead_pct: pct(leads, meetings),
      lead_items: coldLeadItems,
      client_items: coldClientItems,
      closed_items: coldClosedItems,
    }
  } catch {
    return {
      available: false,
      calls: 0,
      meetings: 0,
      leads: coldLeadItems.length,
      clients: coldClientItems.length,
      closed: coldClosedItems.length,
      call_to_lead_pct: 0,
      lead_to_client_pct: pct(coldClientItems.length, coldLeadItems.length),
      call_to_client_pct: 0,
      meeting_to_lead_pct: 0,
      lead_items: coldLeadItems,
      client_items: coldClientItems,
      closed_items: coldClosedItems,
    }
  }
}

const TIMELINE_ALWAYS_CHANNELS: ChannelKey[] = ['web', 'email', 'cold_calling']

/**
 * Analítica de leads para un mes calendario (YYYY-MM).
 */
export async function getLeadsAnalytics(period: string): Promise<LeadsAnalytics> {
  const { start, end, label } = periodBounds(period)
  const [leads, scheduledIds, payments, meetings] = await Promise.all([
    prisma.lead.findMany({
      where: { created_at: { gte: start, lte: end } },
      select: {
        id: true,
        origen_principal: true,
        estado: true,
        created_at: true,
        contact: {
          select: { nombre: true, email: true, empresa: true },
        },
      },
      orderBy: { created_at: 'asc' },
    }),
    loadScheduledLeadIds(),
    loadSetupPaymentLeads(start, end),
    loadMeetingLeadIds(start, end),
  ])

  const channelMap = new Map<
    ChannelKey,
    {
      leads: number
      scheduled: number
      clients: number
      closed: number
      pipeline_eur: number
      won_eur: number
      closed_eur: number
      leadIds: number[]
    }
  >()

  const ensure = (ch: ChannelKey) => {
    if (!channelMap.has(ch)) {
      channelMap.set(ch, {
        leads: 0,
        scheduled: 0,
        clients: 0,
        closed: 0,
        pipeline_eur: 0,
        won_eur: 0,
        closed_eur: 0,
        leadIds: [],
      })
    }
    return channelMap.get(ch)!
  }

  const channelByLead = new Map<number, ChannelKey>()
  const timelineMap = new Map<string, TimelinePoint>()
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = ymd(d)
    const point: TimelinePoint = { day: key, label: dayLabel(key), total: 0 }
    for (const ch of TIMELINE_ALWAYS_CHANNELS) {
      point[ch] = 0
    }
    timelineMap.set(key, point)
  }

  let scheduledAmongCreated = 0
  const leadsTotalItems: LeadListItem[] = []
  const convertedItems: LeadListItem[] = []
  const closedCohortItems: LeadListItem[] = []
  const createdScheduledItems: LeadListItem[] = []

  const toItem = (lead: (typeof leads)[number], channel: ChannelKey): LeadListItem => ({
    id: lead.id,
    name: lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`,
    empresa: lead.contact?.empresa || null,
    email: lead.contact?.email || null,
    channel,
    channel_label: CHANNEL_LABELS[channel],
    created_at: lead.created_at?.toISOString() ?? null,
  })

  for (const lead of leads) {
    const ch = normalizeChannel(lead.origen_principal)
    channelByLead.set(lead.id, ch)
    const bucket = ensure(ch)
    bucket.leads += 1
    bucket.leadIds.push(lead.id)
    const item = toItem(lead, ch)
    leadsTotalItems.push(item)

    const isSched = scheduledIds.has(lead.id)
    if (isSched) {
      bucket.scheduled += 1
      scheduledAmongCreated += 1
      createdScheduledItems.push(item)
    }
    if (payments.firstPaidAny.has(lead.id)) {
      bucket.clients += 1
      bucket.won_eur += payments.firstPaidEurByLead.get(lead.id) || 0
      convertedItems.push(item)
    }
    if (payments.closedAny.has(lead.id)) {
      bucket.closed += 1
      bucket.closed_eur += payments.secondPaidEurByLead.get(lead.id) || 0
      closedCohortItems.push(item)
    }

    const day = ymd(lead.created_at)
    const point = timelineMap.get(day)
    if (point) {
      point.total += 1
      point[ch] = (point[ch] || 0) + 1
    }
  }

  const pipelineByLead = await loadPipelineEurByLead(leads.map((l) => l.id))
  for (const [ch, bucket] of Array.from(channelMap.entries())) {
    let sum = 0
    for (const id of bucket.leadIds) {
      sum += pipelineByLead.get(id) || 0
    }
    bucket.pipeline_eur = sum
    channelMap.set(ch, bucket)
  }

  const spendByChannel = await resolveChannelSpend({
    period,
    start,
    end,
    channelsWithLeads: new Set(Array.from(channelMap.keys())),
  })

  // Ensure every timeline day has an explicit 0 for channels that appear in the month
  const channelsInMonth = new Set<ChannelKey>([
    ...TIMELINE_ALWAYS_CHANNELS,
    ...Array.from(channelMap.keys()),
  ])
  for (const point of Array.from(timelineMap.values())) {
    for (const ch of Array.from(channelsInMonth)) {
      if (point[ch] == null) point[ch] = 0
    }
  }

  const scheduledInPeriod = scheduledIds.size
  const meetingWonIds = meetings.leadIds.filter((id) => payments.firstPaidAny.has(id))
  const wonInPeriodWithMeeting = payments.firstPaidInPeriod.filter((id) =>
    meetings.leadIds.includes(id)
  )

  const [scheduledList, clientsWonItems, clientsClosedItems, meetingItems, meetingToClientItems] =
    await Promise.all([
      hydrateLeadItems(Array.from(scheduledIds), channelByLead),
      hydrateLeadItems(payments.firstPaidInPeriod, channelByLead),
      hydrateLeadItems(payments.closedInPeriod, channelByLead),
      hydrateLeadItems(meetings.leadIds, channelByLead),
      hydrateLeadItems(meetingWonIds, channelByLead),
    ])

  const by_channel: ChannelBreakdownRow[] = Array.from(channelMap.entries())
    .map(([channel, v]) => {
      const spendInfo = spendByChannel.get(channel)
      const spend_eur = spendInfo?.spend || 0
      const spend_source = spendInfo?.source || 'none'
      const pipeline_eur = roundMoney(v.pipeline_eur)
      const won_eur = roundMoney(v.won_eur)
      return {
        channel,
        label: CHANNEL_LABELS[channel],
        leads: v.leads,
        scheduled: v.scheduled,
        clients: v.clients,
        closed: v.closed,
        lead_to_client_pct: pct(v.clients, v.leads),
        lead_to_closed_pct: pct(v.closed, v.leads),
        pipeline_eur,
        won_eur,
        closed_eur: roundMoney(v.closed_eur),
        spend_eur: roundMoney(spend_eur),
        spend_source,
        eur_per_euro_leads: ratioOrNull(pipeline_eur, spend_eur),
        eur_per_euro_clients: ratioOrNull(won_eur, spend_eur),
        return_pct: roiPct(won_eur, spend_eur),
        return_pct_leads: roiPct(pipeline_eur, spend_eur),
        eur_per_lead: v.leads > 0 ? roundMoney(v.won_eur / v.leads) : 0,
        lead_items: leadsTotalItems.filter((x) => x.channel === channel),
        scheduled_items: createdScheduledItems.filter((x) => x.channel === channel),
        client_items: convertedItems.filter((x) => x.channel === channel),
        closed_items: closedCohortItems.filter((x) => x.channel === channel),
      }
    })
    .sort((a, b) => b.leads - a.leads)

  const best_channel = pickBestChannel(by_channel)

  const leads_total = leads.length
  const clients_won = payments.firstPaidInPeriod.length
  const clients_closed = payments.closedInPeriod.length
  const meetingLeads = meetings.leadIds.length
  const kpis = {
    leads_total,
    /** Columna REUNIÓN del pipeline global */
    leads_scheduled: scheduledInPeriod,
    clients_won,
    clients_closed,
    lead_to_client_pct: pct(convertedItems.length, leads_total),
    /** % de leads creados este mes que están en Reunión */
    scheduled_pct: pct(scheduledAmongCreated, leads_total),
    meetings_total: meetings.meetingCount,
    meeting_to_client_pct: pct(meetingWonIds.length, meetingLeads),
    won_with_meeting_pct: pct(wonInPeriodWithMeeting.length, clients_won),
  }

  const coldLeadItems = leadsTotalItems.filter((x) => x.channel === 'cold_calling')
  const coldClientItems = convertedItems.filter((x) => x.channel === 'cold_calling')
  const coldClosedItems = closedCohortItems.filter((x) => x.channel === 'cold_calling')
  const cold_calling = await loadColdCallFunnel(
    start,
    end,
    coldLeadItems,
    coldClientItems,
    coldClosedItems
  )

  return {
    period,
    period_label: label.charAt(0).toUpperCase() + label.slice(1),
    kpis,
    lists: {
      leads_total: [...leadsTotalItems].reverse(),
      leads_scheduled: scheduledList,
      clients_won: clientsWonItems,
      clients_closed: clientsClosedItems,
      converted: convertedItems,
      meetings: meetingItems,
      meeting_to_client: meetingToClientItems,
    },
    by_channel,
    best_channel,
    timeline: Array.from(timelineMap.values()),
    cold_calling,
    suggestions: buildSuggestions({ kpis, by_channel, cold: cold_calling }),
  }
}

export function listRecentPeriods(count = 12): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    out.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return out
}
