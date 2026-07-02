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
  const collMom = pctChange(input.collected_this_month, input.collected_last_month)

  let runwayDate: string | null = null
  if (input.runway_months != null && input.runway_months > 0) {
    const d = new Date()
    d.setMonth(d.getMonth() + Math.floor(input.runway_months))
    runwayDate = d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
  }

  const mrrFooter =
    input.mrr_source === 'tagged'
      ? `ARR implícito: ${fmtEur(input.arr)} · ${input.mrr_tagged_count ?? 0} cobros marcados como mensualidad`
      : `Marca ingresos recurrentes en Ingresos → botón «Marcar MRR»`

  return [
    {
      id: 'mrr',
      title: 'MRR',
      primary: fmtEur(input.mrr),
      help: KPI_HELP.mrr,
      rows: [
        { label: 'Clientes activos', value: String(input.active_clients) },
        { label: 'Ticket medio', value: fmtEur(mrrPerClient) },
        { label: 'ARR vs objetivo', value: `${arrPctOfTarget}%` },
        {
          label: 'Cubre gasto fijo',
          value: mrrCoversBurn == null ? '—' : mrrCoversBurn ? 'Sí' : 'No',
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
      id: 'cash',
      title: 'Caja',
      primary: fmtEur(input.cash_balance),
      help: KPI_HELP.cash,
      rows: [
        {
          label: 'vs mes anterior',
          value:
            input.cash_change_mom != null
              ? `${input.cash_change_mom >= 0 ? '+' : ''}${fmtEur(input.cash_change_mom)}`
              : '—',
        },
        { label: 'Gasto medio/mes', value: fmtEur(input.avg_monthly_burn) },
        {
          label: 'Runway',
          value: input.runway_months != null ? `${input.runway_months} meses` : '—',
        },
        { label: 'Beneficio mes', value: fmtEur(input.profit_this_month) },
      ],
      footer: runwayDate ? `Agotamiento est.: ${runwayDate}` : undefined,
      accent:
        input.runway_months != null && input.runway_months < 3 ? 'critical' : null,
    },
    {
      id: 'runway',
      title: 'Runway',
      primary: input.runway_months != null ? `${input.runway_months}m` : '—',
      help: KPI_HELP.runway,
      rows: [
        { label: 'Caja actual', value: fmtEur(input.cash_balance) },
        { label: 'Burn rate', value: fmtEur(input.avg_monthly_burn) },
        {
          label: 'Cubre con MRR',
          value: mrrCoversBurn == null ? '—' : mrrCoversBurn ? 'Sí' : 'No',
        },
        {
          label: 'Déficit mensual',
          value:
            input.avg_monthly_burn > 0
              ? fmtEur(Math.max(0, input.avg_monthly_burn - input.mrr))
              : '—',
        },
      ],
      footer: runwayDate ? `Hasta ~${runwayDate}` : 'Sin datos de gasto',
      accent:
        input.runway_months != null && input.runway_months < 3 ? 'critical' : null,
    },
    {
      id: 'invoiced',
      title: 'Facturado',
      primary: fmtEur(input.invoiced_this_month),
      help: KPI_HELP.invoiced,
      rows: [
        { label: 'Mes anterior', value: fmtEur(input.invoiced_last_month) },
        { label: 'Variación', value: invMom ?? '—' },
        { label: 'Facturas emitidas', value: String(input.invoices_this_month_count) },
        {
          label: 'Objetivo mes',
          value: `${Math.round((input.invoiced_this_month / (ANNUAL_TARGET / 12)) * 100)}% de ${fmtEur(ANNUAL_TARGET / 12)}`,
        },
      ],
      footer: 'Facturas con estado enviada',
    },
    {
      id: 'collected',
      title: 'Cobrado',
      primary: fmtEur(input.collected_this_month),
      help: KPI_HELP.collected,
      rows: [
        { label: 'Mes anterior', value: fmtEur(input.collected_last_month) },
        { label: 'Variación', value: collMom ?? '—' },
        {
          label: 'Tasa de cobro',
          value:
            input.collection_rate_pct != null ? `${input.collection_rate_pct}%` : '—',
        },
        { label: 'Pendiente histórico', value: fmtEur(input.pending_collection_total) },
      ],
      footer: `${input.pending_invoices_count} facturas sin vincular a banco`,
    },
    {
      id: 'gap',
      title: 'Brecha cobro',
      primary: fmtEur(input.collection_gap),
      help: KPI_HELP.gap,
      rows: [
        { label: 'Facturado mes', value: fmtEur(input.invoiced_this_month) },
        { label: 'Cobrado mes', value: fmtEur(input.collected_this_month) },
        {
          label: '% sin cobrar',
          value:
            input.invoiced_this_month > 0
              ? `${Math.round((input.collection_gap / input.invoiced_this_month) * 100)}%`
              : '0%',
        },
        { label: 'Facturas pendientes', value: String(input.pending_invoices_count) },
      ],
      footer: input.collection_gap > 0 ? 'Concilia en Ingresos' : 'Cobro al día este mes',
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
}): PeriodInsight[] {
  const marginPct =
    stats.income > 0 ? Math.round((stats.profit / stats.income) * 1000) / 10 : 0
  const netMarginPct =
    stats.income > 0
      ? Math.round((stats.netProfitAfterCorporateTax / stats.income) * 1000) / 10
      : 0
  const days = Math.max(1, stats.periodDays)
  const taxTotal = stats.ivaToPay + stats.estimatedCorporateTax

  return [
    {
      label: 'Dinero en cuenta',
      primary: fmtEur(stats.currentBalance),
      help: PERIOD_INSIGHT_HELP['Dinero en cuenta'],
      rows: [
        { label: 'Saldo al cierre del período', value: 'Último movimiento' },
        { label: 'Días en rango', value: String(stats.periodDays) },
      ],
      footer: 'Según extracto bancario sincronizado',
    },
    {
      label: 'Ingresos',
      primary: fmtEur(stats.income),
      help: PERIOD_INSIGHT_HELP.Ingresos,
      rows: [
        { label: 'Media diaria', value: fmtEur(stats.income / days) },
        { label: '% del volumen', value: stats.income + stats.expenses > 0 ? `${Math.round((stats.income / (stats.income + stats.expenses)) * 100)}%` : '—' },
        { label: 'Margen bruto', value: `${marginPct}%` },
      ],
      footer: 'Movimientos positivos en banco',
    },
    {
      label: 'Gastos',
      primary: fmtEur(stats.expenses),
      help: PERIOD_INSIGHT_HELP.Gastos,
      rows: [
        { label: 'Media diaria', value: fmtEur(stats.expenses / days) },
        { label: '% del volumen', value: stats.income + stats.expenses > 0 ? `${Math.round((stats.expenses / (stats.income + stats.expenses)) * 100)}%` : '—' },
        { label: 'Ratio ing/gasto', value: stats.expenses > 0 ? `${(stats.income / stats.expenses).toFixed(1)}×` : '—' },
      ],
      footer: 'Movimientos negativos en banco',
    },
    {
      label: 'Beneficio bruto',
      primary: fmtEur(stats.profit),
      help: PERIOD_INSIGHT_HELP['Beneficio bruto'],
      rows: [
        { label: 'Ingresos − gastos', value: fmtEur(stats.income - stats.expenses) },
        { label: 'Margen', value: `${marginPct}%` },
        { label: 'Media diaria', value: fmtEur(stats.profit / days) },
      ],
    },
    {
      label: 'IVA a deber',
      primary: fmtEur(stats.ivaToPay),
      help: PERIOD_INSIGHT_HELP['IVA a deber'],
      rows: [
        { label: 'Sobre beneficio', value: stats.profit > 0 ? `${Math.round((stats.ivaToPay / stats.profit) * 100)}%` : '—' },
        { label: 'Carga fiscal total', value: fmtEur(taxTotal) },
      ],
      footer: 'IVA repercutido − soportado',
    },
    {
      label: 'Beneficio neto',
      primary: fmtEur(stats.netProfit),
      help: PERIOD_INSIGHT_HELP['Beneficio neto'],
      rows: [
        { label: 'Tras IVA', value: fmtEur(stats.profit - stats.ivaToPay) },
        { label: 'Margen neto', value: stats.income > 0 ? `${Math.round((stats.netProfit / stats.income) * 100)}%` : '—' },
      ],
    },
    {
      label: 'Imp. sociedades',
      primary: fmtEur(stats.estimatedCorporateTax),
      help: PERIOD_INSIGHT_HELP['Imp. sociedades'],
      rows: [
        { label: 'Tipo aplicado', value: '15%' },
        { label: 'Base', value: fmtEur(stats.netProfit) },
      ],
      footer: 'Estimación sobre beneficio neto',
    },
    {
      label: 'Beneficio final',
      primary: fmtEur(stats.netProfitAfterCorporateTax),
      help: PERIOD_INSIGHT_HELP['Beneficio final'],
      rows: [
        { label: 'Margen final', value: `${netMarginPct}%` },
        { label: 'Media diaria', value: fmtEur(stats.netProfitAfterCorporateTax / days) },
        { label: 'Retención fiscal', value: fmtEur(taxTotal) },
      ],
      footer: 'Después de IVA e imp. sociedades',
    },
  ]
}
