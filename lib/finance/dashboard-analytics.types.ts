export type ProjectMoneyBucket = {
  count: number
  setup_eur: number
  monthly_eur: number
}

export type FinanceMonthPoint = {
  period: string
  label: string
  invoiced_eur: number
  collected_eur: number
  expenses_eur: number
  mensualidad_eur: number
}

/** Lead/deal abierto en embudo comercial (aún no cobrado / cerrado) */
export type PipelineOpenDeal = {
  card_id: string
  contact_id: number | null
  name: string
  empresa: string | null
  stage: string
  setup_eur: number
  monthly_eur: number
  has_price: boolean
}

export type FinanceDashboardAnalytics = {
  period: string
  period_label: string
  kpis: {
    bank_balance_eur: number
    invoiced_eur: number
    expenses_eur: number
    clients_current: number
    clients_current_setup_eur: number
    clients_current_monthly_eur: number
    projects_created: ProjectMoneyBucket
    projects_started: ProjectMoneyBucket
    projects_finished: ProjectMoneyBucket
    mensualidad_cobrada_eur: number
    recurring_expenses_eur: number
  }
  timeline: FinanceMonthPoint[]
  averages: {
    avg_setup_eur: number
    avg_monthly_eur: number
  }
  /** Deals abiertos (reunión / propuesta / pendientes) para calculadora */
  pipeline_open: PipelineOpenDeal[]
}

export function currentFinancePeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
