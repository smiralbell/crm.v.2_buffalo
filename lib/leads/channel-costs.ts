import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import {
  marketingTokenToLeadChannel,
  parsePaymentConcept,
  type LeadCostChannel,
} from '@/lib/finance/payment-concepts'
import { CHANNEL_LABELS, type ChannelKey } from '@/lib/leads/analytics.types'

/** Canales editables de coste (captación) */
export type CostChannelKey = 'meta' | 'google' | 'email' | 'cold_calling'
export type CostKind = 'setup' | 'monthly' | 'commission'

export const COST_CHANNEL_KEYS: CostChannelKey[] = ['meta', 'google', 'email', 'cold_calling']

export const COST_CHANNEL_META: Record<
  CostChannelKey,
  {
    label: string
    lead_channel: LeadCostChannel
    kinds: CostKind[]
    model: string
    metrics_channel: string | null
  }
> = {
  meta: {
    label: 'Meta Ads',
    lead_channel: 'web',
    kinds: ['setup', 'monthly'],
    model: 'Setup + mensualidad',
    metrics_channel: 'meta_ads',
  },
  google: {
    label: 'Google Ads',
    lead_channel: 'web',
    kinds: ['setup', 'monthly'],
    model: 'Setup + mensualidad',
    metrics_channel: 'google_ads',
  },
  email: {
    label: 'Email marketing',
    lead_channel: 'email',
    kinds: ['setup', 'monthly'],
    model: 'Setup + mensualidad',
    metrics_channel: 'email_outreach',
  },
  cold_calling: {
    label: 'Cold calling',
    lead_channel: 'cold_calling',
    kinds: ['commission'],
    model: 'Comisión % al cerrar lead',
    metrics_channel: null,
  },
}

export type SpendSource = 'manual' | 'bank' | 'marketing_metrics' | 'default_email' | 'none' | 'mixed'

export type CostLineDetail = {
  channel: CostChannelKey
  cost_kind: CostKind
  label: string
  spend_eur: number
  source: SpendSource
  bank_eur: number
  metrics_eur: number
  manual_eur: number | null
  /** Movimientos bancarios detectados (conceptos MKT…) */
  bank_items: Array<{ description: string; amount: number; date: string }>
}

export type CostChannelDetail = {
  channel: CostChannelKey
  label: string
  lead_channel: LeadCostChannel
  model: string
  total_eur: number
  source: SpendSource
  lines: CostLineDetail[]
}

let ensuredOverrides = false

export async function ensureChannelCostOverridesTable(): Promise<void> {
  if (ensuredOverrides) return
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS channel_cost_overrides (
        id SERIAL PRIMARY KEY,
        period TEXT NOT NULL,
        channel TEXT NOT NULL,
        cost_kind TEXT NOT NULL DEFAULT 'monthly',
        spend_eur NUMERIC(12, 2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE channel_cost_overrides
      ADD COLUMN IF NOT EXISTS cost_kind TEXT NOT NULL DEFAULT 'monthly'
    `)
    await prisma.$executeRawUnsafe(`
      DO $mig$
      BEGIN
        ALTER TABLE channel_cost_overrides
          DROP CONSTRAINT IF EXISTS channel_cost_overrides_period_channel_key;
        ALTER TABLE channel_cost_overrides
          DROP CONSTRAINT IF EXISTS channel_cost_overrides_period_channel_kind_key;
        ALTER TABLE channel_cost_overrides
          ADD CONSTRAINT channel_cost_overrides_period_channel_kind_key
          UNIQUE (period, channel, cost_kind);
      EXCEPTION WHEN others THEN
        NULL;
      END
      $mig$
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS channel_cost_overrides_period_idx
      ON channel_cost_overrides (period)
    `)
    ensuredOverrides = true
  } catch (err) {
    console.warn('[channel-costs] ensure table failed', err)
  }
}

function tokenToCostChannel(token: string): CostChannelKey | null {
  const t = (token || '').trim().toUpperCase()
  if (!t) return null
  if (t === 'META' || t === 'FACEBOOK' || t === 'FB' || t === 'INSTAGRAM') return 'meta'
  if (t === 'GOOGLE' || t === 'ADWORDS' || t === 'SEM') return 'google'
  if (t === 'EMAIL' || t === 'INSTANTLY' || t === 'OUTREACH' || t === 'MAIL') return 'email'
  if (t === 'COLDCALL' || t === 'COLD' || t === 'COLDCALLING' || t === 'CALLING') {
    return 'cold_calling'
  }
  if (t === 'ADS') return 'meta'
  return null
}

function detailToKind(detail: string | undefined, channel: CostChannelKey): CostKind {
  const d = (detail || '').toUpperCase()
  if (channel === 'cold_calling') return 'commission'
  if (d.includes('SETUP') || d.includes('SET UP') || d.includes('ONBOARD')) return 'setup'
  if (d.includes('COMISION') || d.includes('COMISIÓN')) return 'commission'
  return 'monthly'
}

type LineKey = `${CostChannelKey}:${CostKind}`

function lineKey(ch: CostChannelKey, kind: CostKind): LineKey {
  return `${ch}:${kind}`
}

async function loadBankLines(
  start: Date,
  end: Date
): Promise<{
  totals: Map<LineKey, number>
  items: Map<LineKey, Array<{ description: string; amount: number; date: string }>>
}> {
  const totals = new Map<LineKey, number>()
  const items = new Map<LineKey, Array<{ description: string; amount: number; date: string }>>()
  const startStr = start.toISOString().slice(0, 10)
  const endStr = end.toISOString().slice(0, 10)
  try {
    const { rows } = await query<{ description: string; amount: string; date: string }>(
      `SELECT description, amount::text AS amount, date::text AS date
       FROM bank_transactions
       WHERE date >= $1 AND date <= $2 AND amount < 0`,
      [startStr, endStr]
    )
    for (const r of rows) {
      const parsed = parsePaymentConcept(r.description || '')
      if (parsed.bucket !== 'marketing') continue
      const ch =
        (parsed.marketing_channel ? tokenToCostChannel(parsed.marketing_channel) : null) ||
        (parsed.lead_cost_channel === 'email'
          ? 'email'
          : parsed.lead_cost_channel === 'cold_calling'
            ? 'cold_calling'
            : parsed.lead_cost_channel === 'web'
              ? tokenToCostChannel(parsed.marketing_channel || 'ADS')
              : null)
      if (!ch) continue
      const kind = detailToKind(
        parsed.raw.replace(/^(?:MKT|MARKETING)\s+\w+\s*/i, ''),
        ch
      )
      const allowed = COST_CHANNEL_META[ch].kinds
      const useKind = allowed.includes(kind) ? kind : allowed[0]
      const eur = Math.abs(Number(r.amount) || 0)
      const key = lineKey(ch, useKind)
      totals.set(key, (totals.get(key) || 0) + eur)
      const list = items.get(key) || []
      list.push({
        description: (r.description || '').trim().slice(0, 80),
        amount: Math.round(eur * 100) / 100,
        date: (r.date || '').slice(0, 10),
      })
      items.set(key, list)
    }
  } catch (err) {
    console.warn('[channel-costs] bank spend failed', err)
  }
  return { totals, items }
}

async function loadMetricsByCostChannel(
  period: string
): Promise<Map<CostChannelKey, number>> {
  const map = new Map<CostChannelKey, number>()
  try {
    const rows = await prisma.marketingMetric.findMany({
      where: { period },
      select: { channel: true, spend: true },
    })
    for (const r of rows) {
      const raw = (r.channel || '').toLowerCase()
      let ch: CostChannelKey | null = null
      if (raw.includes('meta') || raw.includes('facebook')) ch = 'meta'
      else if (raw.includes('google')) ch = 'google'
      else if (raw.includes('email') || raw.includes('outreach')) ch = 'email'
      else if (raw.includes('cold')) ch = 'cold_calling'
      if (!ch) continue
      map.set(ch, (map.get(ch) || 0) + (Number(r.spend) || 0))
    }
  } catch {
    // ignore
  }
  return map
}

async function loadManualLines(
  period: string
): Promise<Map<LineKey, { spend: number; notes: string | null }>> {
  const map = new Map<LineKey, { spend: number; notes: string | null }>()
  await ensureChannelCostOverridesTable()
  try {
    const rows = await prisma.$queryRawUnsafe<
      { channel: string; cost_kind: string; spend_eur: number | string; notes: string | null }[]
    >(
      `SELECT channel, COALESCE(cost_kind, 'monthly') AS cost_kind, spend_eur, notes
       FROM channel_cost_overrides
       WHERE period = $1`,
      period
    )
    for (const r of rows) {
      const ch = r.channel as CostChannelKey
      if (!COST_CHANNEL_KEYS.includes(ch)) continue
      const kind = (r.cost_kind || 'monthly') as CostKind
      if (!COST_CHANNEL_META[ch].kinds.includes(kind)) continue
      map.set(lineKey(ch, kind), {
        spend: Number(r.spend_eur) || 0,
        notes: r.notes,
      })
    }
  } catch (err) {
    console.warn('[channel-costs] load overrides failed', err)
  }
  return map
}

function resolveLine(
  ch: CostChannelKey,
  kind: CostKind,
  manual: Map<LineKey, { spend: number; notes: string | null }>,
  bankTotals: Map<LineKey, number>,
  bankItems: Map<LineKey, Array<{ description: string; amount: number; date: string }>>,
  metricsTotal: Map<CostChannelKey, number>
): CostLineDetail {
  const key = lineKey(ch, kind)
  const man = manual.get(key)
  const bankEur = bankTotals.get(key) || 0
  // metrics only as monthly fallback when no setup/monthly split
  const metricsEur =
    kind === 'monthly' || kind === 'commission' ? metricsTotal.get(ch) || 0 : 0

  let spend = 0
  let source: SpendSource = 'none'
  if (man) {
    spend = man.spend
    source = 'manual'
  } else if (bankEur > 0) {
    spend = bankEur
    source = 'bank'
  } else if (metricsEur > 0) {
    spend = metricsEur
    source = 'marketing_metrics'
  }

  const kindLabel =
    kind === 'setup' ? 'Setup' : kind === 'monthly' ? 'Mensualidad' : 'Comisión'

  return {
    channel: ch,
    cost_kind: kind,
    label: kindLabel,
    spend_eur: Math.round(spend * 100) / 100,
    source,
    bank_eur: Math.round(bankEur * 100) / 100,
    metrics_eur: Math.round(metricsEur * 100) / 100,
    manual_eur: man ? man.spend : null,
    bank_items: bankItems.get(key) || [],
  }
}

function channelTotalSource(lines: CostLineDetail[]): SpendSource {
  const sources = new Set(lines.filter((l) => l.spend_eur > 0).map((l) => l.source))
  if (sources.size === 0) return 'none'
  if (sources.size === 1) return Array.from(sources)[0]
  return 'mixed'
}

export async function getChannelCostsDetail(
  period: string,
  start: Date,
  end: Date,
  filterChannel?: CostChannelKey | null
): Promise<CostChannelDetail[]> {
  const [manual, bankPack, metrics] = await Promise.all([
    loadManualLines(period),
    loadBankLines(start, end),
    loadMetricsByCostChannel(period),
  ])
  const { totals: bankTotals, items: bankItems } = bankPack

  const keys = filterChannel ? [filterChannel] : COST_CHANNEL_KEYS

  const details = keys.map((channel) => {
    const meta = COST_CHANNEL_META[channel]
    const lines = meta.kinds.map((kind) =>
      resolveLine(channel, kind, manual, bankTotals, bankItems, metrics)
    )
    // Email default 500 on monthly if nothing else
    if (
      channel === 'email' &&
      lines.every((l) => l.spend_eur <= 0) &&
      !manual.has(lineKey('email', 'monthly')) &&
      !manual.has(lineKey('email', 'setup'))
    ) {
      const monthly = lines.find((l) => l.cost_kind === 'monthly')
      if (monthly) {
        monthly.spend_eur = 500
        monthly.source = 'default_email'
      }
    }
    const total_eur = Math.round(lines.reduce((s, l) => s + l.spend_eur, 0) * 100) / 100
    return {
      channel,
      label: meta.label,
      lead_channel: meta.lead_channel,
      model: meta.model,
      total_eur,
      source: channelTotalSource(lines),
      lines,
    }
  })

  // Si hay gasto de banco y no hay override manual, refleja el total en marketing_metrics
  await Promise.all(
    details.map(async (d) => {
      const hasManual = d.lines.some((l) => l.manual_eur != null)
      if (hasManual) return
      if (d.source !== 'bank' || d.total_eur <= 0) return
      const m = COST_CHANNEL_META[d.channel]
      if (!m.metrics_channel) return
      try {
        await prisma.marketingMetric.upsert({
          where: { channel_period: { channel: m.metrics_channel, period } },
          create: { channel: m.metrics_channel, period, spend: d.total_eur },
          update: { spend: d.total_eur },
        })
      } catch {
        try {
          await prisma.$executeRawUnsafe(
            `
            INSERT INTO marketing_metrics (channel, period, spend, emails_sent, contacts_sent, replies, interested, not_interested, bounced, unsubscribed, meetings_booked, created_at, updated_at)
            VALUES ($1, $2, $3, 0, 0, 0, 0, 0, 0, 0, 0, NOW(), NOW())
            ON CONFLICT (channel, period)
            DO UPDATE SET spend = EXCLUDED.spend, updated_at = NOW()
            `,
            m.metrics_channel,
            period,
            d.total_eur
          )
        } catch {
          // ignore
        }
      }
    })
  )

  return details
}

/** Agrega a canales de leads (web = meta+google). */
export async function resolveChannelSpend(input: {
  period: string
  start: Date
  end: Date
  channelsWithLeads: Set<ChannelKey>
}): Promise<Map<ChannelKey, { spend: number; source: SpendSource }>> {
  const details = await getChannelCostsDetail(input.period, input.start, input.end)
  const out = new Map<ChannelKey, { spend: number; source: SpendSource }>()

  const byLead = new Map<LeadCostChannel, CostChannelDetail[]>()
  for (const d of details) {
    const list = byLead.get(d.lead_channel) || []
    list.push(d)
    byLead.set(d.lead_channel, list)
  }

  for (const leadCh of ['email', 'web', 'cold_calling'] as LeadCostChannel[]) {
    const parts = byLead.get(leadCh) || []
    let spend = parts.reduce((s, p) => s + p.total_eur, 0)
    let source = channelTotalSource(parts.flatMap((p) => p.lines))

    if (
      leadCh === 'email' &&
      spend <= 0 &&
      input.channelsWithLeads.has('email')
    ) {
      spend = 500
      source = 'default_email'
    }

    out.set(leadCh, {
      spend: Math.round(spend * 100) / 100,
      source,
    })
  }

  return out
}

async function syncMarketingMetricSpend(
  period: string,
  channel: CostChannelKey
): Promise<void> {
  const meta = COST_CHANNEL_META[channel]
  if (!meta.metrics_channel) return
  await ensureChannelCostOverridesTable()
  let spend = 0
  try {
    const rows = await prisma.$queryRawUnsafe<{ spend_eur: number | string }[]>(
      `SELECT COALESCE(SUM(spend_eur), 0) AS spend_eur
       FROM channel_cost_overrides
       WHERE period = $1 AND channel = $2`,
      period,
      channel
    )
    spend = Number(rows[0]?.spend_eur) || 0
  } catch {
    spend = 0
  }

  try {
    await prisma.marketingMetric.upsert({
      where: {
        channel_period: { channel: meta.metrics_channel, period },
      },
      create: {
        channel: meta.metrics_channel,
        period,
        spend,
      },
      update: {
        spend,
      },
    })
  } catch {
    try {
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO marketing_metrics (channel, period, spend, emails_sent, contacts_sent, replies, interested, not_interested, bounced, unsubscribed, meetings_booked, created_at, updated_at)
        VALUES ($1, $2, $3, 0, 0, 0, 0, 0, 0, 0, 0, NOW(), NOW())
        ON CONFLICT (channel, period)
        DO UPDATE SET spend = EXCLUDED.spend, updated_at = NOW()
        `,
        meta.metrics_channel,
        period,
        spend
      )
    } catch (err2) {
      console.warn('[channel-costs] sync marketing_metrics failed', err2)
    }
  }
}

export async function upsertChannelCostLine(input: {
  period: string
  channel: CostChannelKey
  cost_kind: CostKind
  spend_eur: number
  notes?: string | null
}): Promise<void> {
  await ensureChannelCostOverridesTable()
  const meta = COST_CHANNEL_META[input.channel]
  if (!meta || !meta.kinds.includes(input.cost_kind)) {
    throw new Error('Canal o tipo de coste inválido')
  }
  const spend = Math.max(0, Math.round(Number(input.spend_eur) * 100) / 100)
  const notes = input.notes?.trim() || null
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO channel_cost_overrides (period, channel, cost_kind, spend_eur, notes, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (period, channel, cost_kind)
    DO UPDATE SET spend_eur = EXCLUDED.spend_eur, notes = EXCLUDED.notes, updated_at = NOW()
    `,
    input.period,
    input.channel,
    input.cost_kind,
    spend,
    notes
  )
  await syncMarketingMetricSpend(input.period, input.channel)
}

export async function deleteChannelCostLine(
  period: string,
  channel: CostChannelKey,
  cost_kind: CostKind
): Promise<void> {
  await ensureChannelCostOverridesTable()
  await prisma.$executeRawUnsafe(
    `DELETE FROM channel_cost_overrides WHERE period = $1 AND channel = $2 AND cost_kind = $3`,
    period,
    channel,
    cost_kind
  )
  await syncMarketingMetricSpend(period, channel)
}

export async function clearChannelCostOverrides(
  period: string,
  channel: CostChannelKey
): Promise<void> {
  await ensureChannelCostOverridesTable()
  await prisma.$executeRawUnsafe(
    `DELETE FROM channel_cost_overrides WHERE period = $1 AND channel = $2`,
    period,
    channel
  )
  await syncMarketingMetricSpend(period, channel)
}

// Keep type export used by analytics
export type { LeadCostChannel }
