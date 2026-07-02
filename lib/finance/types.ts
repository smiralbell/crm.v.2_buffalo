export type AlertPriority = 'good' | 'medium' | 'bad'

/** @deprecated use priority — kept for compat */
export type AlertSeverity = AlertPriority

export interface FinanceAlert {
  id: string
  priority: AlertPriority
  title: string
  message: string
  action_label?: string
  action_href?: string
}

export interface MonthlyCashFlow {
  month: string
  income: number
  expenses: number
  net: number
}

export interface MonthlyInvoicedCollected {
  month: string
  invoiced: number
  collected: number
}

export interface PendingInvoiceRow {
  id: number
  invoice_number: string
  client_name: string
  total: number
  issue_date: string
  due_date: string | null
  days_overdue: number | null
}

export interface CategorySlice {
  id: string
  label: string
  amount: number
  percentage: number
  transaction_count: number
  avg_transaction: number
  top_descriptions: string[]
}

export interface MrrClientRow {
  name: string
  amount: number
  source?: 'tagged'
}

export interface NetTrendPoint {
  month: string
  net: number
}

export interface ProjectEconomicsRow {
  id: string
  name: string
  monthly_fee_eur: number
  llm_cost_eur: number
  infra_cost_eur: number
  total_cost_eur: number
  margin_pct: number | null
  days_inactive_streak: number | null
  nps_score_avg: number | null
}

export interface ExecutiveKpis {
  mrr: number
  arr: number
  active_clients: number
  cash_balance: number
  runway_months: number | null
  invoiced_this_month: number
  collected_this_month: number
  collection_gap: number
  pipeline_value: number
  avg_monthly_burn: number
  profit_this_month: number
  annual_target: number
  annual_progress_pct: number
}

export interface AnnualGoalDetail {
  target: number
  invoiced_ytd: number
  achieved_pct: number
  remaining_amount: number
  remaining_pct: number
  months_remaining: number
  required_monthly_avg: number
  monthly_target_even: number
  invoiced_this_month: number
  this_month_vs_monthly_target_pct: number
  expected_pace_ytd: number
  pace_delta: number
  pace_status: 'ahead' | 'behind' | 'on_track'
  pace_label: string
  projected_year_end: number
}

export interface KpiRow {
  label: string
  value: string
}

export interface RichKpiCard {
  id: string
  title: string
  primary: string
  rows: KpiRow[]
  footer?: string
  help?: string
  accent?: 'warning' | 'critical' | null
}

export interface PeriodInsight {
  label: string
  primary: string
  rows: KpiRow[]
  footer?: string
  help?: string
}

export interface RecurringExpenseRow {
  vendor_key: string
  label: string
  bucket: string
  bucket_label: string
  category_id: string
  category_label: string
  frequency: string
  average_amount: number
  monthly_equivalent: number
  annual_cost: number
  count: number
  last_date: string
  months_active?: number
  detection_source?: 'concept' | 'pattern' | 'recurrence'
}

export interface RecurringExpenseGroup {
  bucket: string
  label: string
  monthly_total: number
  annual_total: number
  count: number
  items: RecurringExpenseRow[]
}

export interface RecurringExpensesSummary {
  monthly_total: number
  annual_total: number
  count: number
  items: RecurringExpenseRow[]
  groups: RecurringExpenseGroup[]
}

export interface ExecutiveSummary {
  period_label: string
  kpis: ExecutiveKpis
  annual_goal: AnnualGoalDetail
  kpi_cards: RichKpiCard[]
  cash_flow: MonthlyCashFlow[]
  invoiced_vs_collected: MonthlyInvoicedCollected[]
  expense_breakdown: CategorySlice[]
  income_breakdown: CategorySlice[]
  expense_source_label: string
  mrr_by_client: MrrClientRow[]
  net_trend: NetTrendPoint[]
  alerts: FinanceAlert[]
  pending_invoices: PendingInvoiceRow[]
  project_economics: ProjectEconomicsRow[]
  recurring_expenses: RecurringExpensesSummary
  generated_at: string
}

export interface FinanceAiSummary {
  resumen_ejecutivo: string
  salud_financiera_0_100: number
  wins: string[]
  riesgos: string[]
  alertas_prioritarias: string[]
  acciones_esta_semana: string[]
  oportunidades_crecimiento: string[]
  metricas_clave: Array<{ nombre: string; valor: string; interpretacion: string }>
  path_a_objetivo: string
}
