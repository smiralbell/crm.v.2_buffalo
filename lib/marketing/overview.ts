import { getLeadsAnalytics } from '@/lib/leads/analytics'
import {
  CHANNEL_GROUP,
  CHANNEL_GROUP_LABELS,
  CHANNEL_LABELS,
  type ChannelBreakdownRow,
  type ChannelGroupKey,
  type ChannelKey,
} from '@/lib/leads/analytics.types'
import { getPlanMonth } from '@/lib/marketing/plan'
import { summarizePlan, type PlanGoals, type PlanSummary } from '@/lib/marketing/plan.types'

/** Panel general de marketing: solo lectura sobre lo que ya calcula Analítica de leads. */

export type OverviewTotals = {
  spend_eur: number
  leads: number
  scheduled: number
  clients: number
  won_eur: number
  /** Coste por lead (solo canales con gasto) */
  cpl_eur: number | null
  /** Coste por cliente (solo canales con gasto) */
  cac_eur: number | null
  /** ROI de los canales con gasto: (cobrado - gasto) / gasto */
  roi_pct: number | null
}

export type OverviewChannelRow = {
  channel: ChannelKey
  label: string
  group: ChannelGroupKey
  spend_eur: number
  leads: number
  scheduled: number
  clients: number
  won_eur: number
  cpl_eur: number | null
  cac_eur: number | null
  prev_leads: number
  prev_cpl_eur: number | null
}

export type OverviewGroup = {
  group: ChannelGroupKey
  label: string
  totals: OverviewTotals
  channels: OverviewChannelRow[]
}

export type OverviewAlert = { level: 'warn' | 'info' | 'good'; text: string }

export type MarketingOverview = {
  period: string
  period_label: string
  prev_period: string
  totals: OverviewTotals
  prev_totals: OverviewTotals
  /** Reuniones ya celebradas en el mes (calendario) */
  meetings: number
  prev_meetings: number
  groups: OverviewGroup[]
  alerts: OverviewAlert[]
  plan: (PlanSummary & { ready: boolean; goals: PlanGoals }) | null
}

const GROUP_ORDER: ChannelGroupKey[] = ['paid', 'organic', 'outbound', 'relations', 'other']

const round = (n: number) => Math.round(n * 100) / 100
const ratio = (num: number, den: number) => (den > 0 ? round(num / den) : null)

export function prevPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function totalsOf(rows: Pick<ChannelBreakdownRow, 'spend_eur' | 'leads' | 'scheduled' | 'clients' | 'won_eur'>[]): OverviewTotals {
  const t = rows.reduce(
    (a, r) => ({
      spend_eur: a.spend_eur + r.spend_eur,
      leads: a.leads + r.leads,
      scheduled: a.scheduled + r.scheduled,
      clients: a.clients + r.clients,
      won_eur: a.won_eur + r.won_eur,
    }),
    { spend_eur: 0, leads: 0, scheduled: 0, clients: 0, won_eur: 0 }
  )
  const paid = rows.filter((r) => r.spend_eur > 0)
  const pSpend = paid.reduce((s, r) => s + r.spend_eur, 0)
  const pLeads = paid.reduce((s, r) => s + r.leads, 0)
  const pClients = paid.reduce((s, r) => s + r.clients, 0)
  const pWon = paid.reduce((s, r) => s + r.won_eur, 0)
  return {
    spend_eur: round(t.spend_eur),
    leads: t.leads,
    scheduled: t.scheduled,
    clients: t.clients,
    won_eur: round(t.won_eur),
    cpl_eur: ratio(pSpend, pLeads),
    cac_eur: ratio(pSpend, pClients),
    roi_pct: pSpend > 0 ? Math.round(((pWon - pSpend) / pSpend) * 1000) / 10 : null,
  }
}

export function buildAlerts(rows: OverviewChannelRow[], plan: MarketingOverview['plan']): OverviewAlert[] {
  const out: OverviewAlert[] = []
  for (const r of rows) {
    if (r.spend_eur > 0 && r.leads === 0) {
      out.push({ level: 'warn', text: `${r.label}: ${Math.round(r.spend_eur)} € invertidos este mes y ningún lead todavía.` })
    } else if (r.cpl_eur != null && r.prev_cpl_eur != null && r.prev_cpl_eur > 0) {
      const ch = (r.cpl_eur - r.prev_cpl_eur) / r.prev_cpl_eur
      if (ch >= 0.3) {
        out.push({ level: 'warn', text: `${r.label}: el coste por lead sube un ${Math.round(ch * 100)} % (${Math.round(r.prev_cpl_eur)} € → ${Math.round(r.cpl_eur)} €).` })
      } else if (ch <= -0.2) {
        out.push({ level: 'good', text: `${r.label}: el coste por lead baja un ${Math.round(-ch * 100)} % (${Math.round(r.prev_cpl_eur)} € → ${Math.round(r.cpl_eur)} €).` })
      }
    }
    if (r.leads >= 3 && r.scheduled === 0) {
      out.push({ level: 'info', text: `${r.label}: ${r.leads} leads este mes y ninguno en reunión todavía.` })
    }
  }
  if (plan?.ready && plan.atrasados > 0) {
    out.push({ level: 'warn', text: `Planificación: ${plan.atrasados} pieza(s) con fecha pasada sin publicar.` })
  }
  return out
}

export async function getMarketingOverview(period: string): Promise<MarketingOverview> {
  const prev = prevPeriod(period)
  const [cur, before, planMonth] = await Promise.all([
    getLeadsAnalytics(period),
    getLeadsAnalytics(prev),
    getPlanMonth(period).catch(() => null),
  ])

  const prevBy = new Map(before.by_channel.map((r) => [r.channel, r]))
  const rows: OverviewChannelRow[] = cur.by_channel.map((r) => {
    const p = prevBy.get(r.channel)
    return {
      channel: r.channel,
      label: CHANNEL_LABELS[r.channel],
      group: CHANNEL_GROUP[r.channel],
      spend_eur: r.spend_eur,
      leads: r.leads,
      scheduled: r.scheduled,
      clients: r.clients,
      won_eur: r.won_eur,
      cpl_eur: r.spend_eur > 0 ? ratio(r.spend_eur, r.leads) : null,
      cac_eur: r.spend_eur > 0 ? ratio(r.spend_eur, r.clients) : null,
      prev_leads: p?.leads ?? 0,
      prev_cpl_eur: p && p.spend_eur > 0 ? ratio(p.spend_eur, p.leads) : null,
    }
  })

  const groups: OverviewGroup[] = GROUP_ORDER.map((g) => {
    const channels = rows.filter((r) => r.group === g).sort((a, b) => b.leads - a.leads || b.spend_eur - a.spend_eur)
    return { group: g, label: CHANNEL_GROUP_LABELS[g], totals: totalsOf(channels), channels }
  }).filter((g) => g.channels.length > 0)

  const today = new Date().toISOString().slice(0, 10)
  const plan = planMonth
    ? { ...summarizePlan(planMonth.items, planMonth.goals, today), ready: planMonth.ready, goals: planMonth.goals }
    : null

  return {
    period,
    period_label: cur.period_label,
    prev_period: prev,
    totals: totalsOf(cur.by_channel),
    prev_totals: totalsOf(before.by_channel),
    meetings: cur.kpis.meetings_total,
    prev_meetings: before.kpis.meetings_total,
    groups,
    alerts: buildAlerts(rows, plan),
    plan,
  }
}
