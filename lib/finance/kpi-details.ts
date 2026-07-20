import { fmtEur, ANNUAL_TARGET } from './chart-theme'
import { KPI_HELP, PERIOD_INSIGHT_HELP } from './kpi-help'
import type { AnnualGoalDetail, PeriodInsight, RichKpiCard } from './types'

export type { AnnualGoalDetail, PeriodInsight, RichKpiCard }

export interface BuildKpiInput {
  mrr: number
  arr: number
  active_clients: number
  cash_balance: number
  cash_change_mom: number | null
  runway_months: number | null
  avg_monthly_burn: number
  platform_burn_months?: number
  invoiced_this_month: number
  invoiced_last_month: number
  collected_this_month: number
  collected_last_month: number
  collection_gap: number
  collection_rate_pct: number | null
  pending_collection_total: number
  pending_invoices_count: number
  invoices_this_month_count: number
  pipeline_value: number
  pipeline_deals: number
  profit_this_month: number
  ytdInvoiced: number
  mrr_source?: 'tagged' | 'none'
  mrr_tagged_count?: number
}

function pctChange(curr: number, prev: number): string | null {
  if (prev === 0) return curr > 0 ? '+100%' : null
  const p = Math.round(((curr - prev) / prev) * 100)
  return `${p >= 0 ? '+' : ''}${p}%`
}

function paceStatus(delta: number, target: number): 'ahead' | 'behind' | 'on_track' {
  const threshold = target * 0.02
  if (delta > threshold) return 'ahead'
  if (delta < -threshold) return 'behind'
  return 'on_track'
}

export function buildAnnualGoalDetail(input: {
  ytdInvoiced: number
  invoiced_this_month: number
  now?: Date
}): AnnualGoalDetail {
  const now = input.now ?? new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(y, 0, 1).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1
  const daysInYear =
    (new Date(y, 11, 31).getTime() - new Date(y, 0, 1).getTime()) / (1000 * 60 * 60 * 24) + 1

  const target = ANNUAL_TARGET
  const invoiced_ytd = input.ytdInvoiced
  const remaining_amount = Math.max(0, target - invoiced_ytd)
  const achieved_pct = Math.round((invoiced_ytd / target) * 1000) / 10
  const remaining_pct = Math.round((remaining_amount / target) * 1000) / 10
  const months_remaining = 12 - m
  const required_monthly_avg =
    months_remaining > 0 ? Math.round(remaining_amount / months_remaining) : 0
  const monthly_target_even = Math.round(target / 12)
  const expected_pace_ytd = Math.round((target * dayOfYear) / daysInYear)
  const pace_delta = Math.round(invoiced_ytd - expected_pace_ytd)
  const status = paceStatus(pace_delta, target)
  const this_month_vs_monthly_target_pct =
    monthly_target_even > 0
      ? Math.round((input.invoiced_this_month / monthly_target_even) * 1000) / 10
      : 0

  const yearProgress = dayOfYear / daysInYear
  const projected_year_end =
    yearProgress > 0 ? Math.round(invoiced_ytd / yearProgress) : invoiced_ytd

  let pace_label: string
  if (status === 'ahead') {
    pace_label = `Vas ${fmtEur(Math.abs(pace_delta))} por delante del ritmo lineal`
  } else if (status === 'behind') {
    pace_label = `Vas ${fmtEur(Math.abs(pace_delta))} por detrás del ritmo lineal`
  } else {
    pace_label = 'Ritmo alineado con el objetivo anual'
  }

  return {
    target,
    invoiced_ytd,
    achieved_pct,
    remaining_amount,
    remaining_pct,
    months_remaining,
    required_monthly_avg,
    monthly_target_even,
    invoiced_this_month: input.invoiced_this_month,
    this_month_vs_monthly_target_pct,
    expected_pace_ytd,
    pace_delta,
    pace_status: status,
    pace_label,
    projected_year_end,
  }
}

export function buildRichKpiCards(input: BuildKpiInput): RichKpiCard[] {
  const mrrPerClient = input.active_clients > 0 ? input.mrr / input.active_clients : 0
  const arrPctOfTarget = Math.round((input.arr / ANNUAL_TARGET) * 1000) / 10
  const mrrCoversBurn = input.avg_monthly_burn > 0 ? input.mrr >= input.avg_monthly_burn : null
  const avgDeal = input.pipeline_deals > 0 ? input.pipeline_value / input.pipeline_deals : 0
  const pipelinePctTarget = Math.round((input.pipeline_value / ANNUAL_TARGET) * 1000) / 10

  const invMom = pctChange(input.invoiced_this_month, input.invoiced_last_month)

  const mrrFooter =
    input.mrr_source === 'tagged'
      ? `${input.mrr_tagged_count ?? 0} cobros marcados como mensualidad`
      : `Marca ingresos recurrentes en Ingresos → «Marcar MRR»`

  return [
    {
      id: 'mrr',
      title: 'MRR',
      primary: fmtEur(input.mrr),
      help: KPI_HELP.mrr,
      rows: [
        { label: 'Clientes activos', value: String(input.active_clients) },
        { label: 'Ticket medio', value: fmtEur(mrrPerClient) },
        {
          label: 'Cubre plataformas',
          value: mrrCoversBurn == null ? '—' : mrrCoversBurn ? 'Sí' : 'No',
        },
        {
          label: 'Gap vs burn PLT',
          value:
            input.avg_monthly_burn > 0
              ? fmtEur(input.mrr - input.avg_monthly_burn)
              : '—',
        },
      ],
      footer: mrrFooter,
    },
    {
      id: 'arr',
      title: 'ARR',
      primary: fmtEur(input.arr),
      help: KPI_HELP.arr,
      rows: [
        { label: 'MRR × 12', value: fmtEur(input.mrr) },
        { label: '% del objetivo 250k', value: `${arrPctOfTarget}%` },
        {
          label: 'Gap vs 250k',
          value: fmtEur(Math.max(0, ANNUAL_TARGET - input.arr)),
        },
        {
          label: 'MRR necesario',
          value: fmtEur(Math.max(0, (ANNUAL_TARGET - input.arr) / 12)),
        },
      ],
      footer: 'Ingreso recurrente anualizado',
    },
    {
      id: 'gap',
      title: 'Brecha cobro',
      primary: fmtEur(input.collection_gap),
      help: KPI_HELP.gap,
      rows: [
        { label: 'Facturado (emisión)', value: fmtEur(input.invoiced_this_month) },
        { label: 'Cobrado (banco)', value: fmtEur(input.collected_this_month) },
        {
          label: 'Tasa de cobro',
          value:
            input.collection_rate_pct != null ? `${input.collection_rate_pct}%` : '—',
        },
        {
          label: 'Variación facturado',
          value: invMom ?? '—',
        },
      ],
      footer:
        input.collection_gap > 0
          ? `${input.pending_invoices_count} facturas sin vincular · concilia en Ingresos`
          : 'Cobro al día en el período',
      accent: input.collection_gap > 500 ? 'warning' : null,
    },
    {
      id: 'pipeline',
      title: 'Pipeline',
      primary: fmtEur(input.pipeline_value),
      help: KPI_HELP.pipeline,
      rows: [
        { label: 'Oportunidades', value: String(input.pipeline_deals) },
        { label: 'Ticket medio', value: fmtEur(avgDeal) },
        { label: '% del objetivo', value: `${pipelinePctTarget}%` },
        { label: 'Si cierra todo', value: fmtEur(input.ytdInvoiced + input.pipeline_value) },
      ],
      footer: 'NEGOCIANDO · PROPUESTA · REUNIÓN · CONTRATO',
    },
  ]
}

/** Solo estimaciones fiscales — no repite cobros/pagos/saldo de caja. */
export function buildPeriodInsights(stats: {
  currentBalance: number
  income: number
  expenses: number
  profit: number
  ivaToPay: number
  netProfit: number
  estimatedCorporateTax: number
  netProfitAfterCorporateTax: number
  periodDays: number
  corporateTaxPercent?: number
  hasIvaData?: boolean
  fiscalGross?: number
}): PeriodInsight[] {
  const netMarginPct =
    stats.income > 0
      ? Math.round((stats.netProfitAfterCorporateTax / stats.income) * 1000) / 10
      : 0
  const taxTotal = Math.max(0, stats.ivaToPay) + stats.estimatedCorporateTax
  const taxPct = stats.corporateTaxPercent ?? 25
  const fiscalBase = stats.fiscalGross ?? stats.profit

  return [
    {
      label: 'IVA a liquidar',
      primary: fmtEur(stats.ivaToPay),
      help: PERIOD_INSIGHT_HELP['IVA a deber'],
      rows: [
        {
          label: 'Datos IVA',
          value: stats.hasIvaData ? 'Facturas/gastos vinculados' : 'Sin vínculos IVA',
        },
        { label: 'Carga fiscal est.', value: fmtEur(taxTotal) },
      ],
      footer: 'IVA repercutido − soportado (estimación)',
    },
    {
      label: 'Imp. sociedades',
      primary: fmtEur(stats.estimatedCorporateTax),
      help: PERIOD_INSIGHT_HELP['Imp. sociedades'],
      rows: [
        { label: 'Tipo aplicado', value: `${taxPct}%` },
        { label: 'Base fiscal est.', value: fmtEur(fiscalBase) },
      ],
      footer: `Estimación ${taxPct}% sobre resultado fiscal`,
    },
    {
      label: 'Resultado tras impuestos',
      primary: fmtEur(stats.netProfitAfterCorporateTax),
      help: PERIOD_INSIGHT_HELP['Beneficio final'],
      rows: [
        { label: 'Bruto caja', value: fmtEur(stats.profit) },
        { label: 'Margen final', value: `${netMarginPct}%` },
        { label: 'Retención fiscal est.', value: fmtEur(taxTotal) },
      ],
      footer: 'Estimación — no sustituye a tu gestoría',
    },
  ]
}
