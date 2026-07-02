import type { BankConnectionStatus } from '@/lib/enable-banking/connection-status'
import type { FinanceAlert, PendingInvoiceRow, ProjectEconomicsRow } from './types'

interface AlertContext {
  bankConnection: BankConnectionStatus
  collectionGap: number
  collectionRatePct: number | null
  pendingInvoices: PendingInvoiceRow[]
  draftCount: number
  runwayMonths: number | null
  cashBalance: number
  highCostProjects: ProjectEconomicsRow[]
  mrr: number
  pipelineValue: number
  unlinkedManualExpenses: number
  unlinkedManualTotal: number
  bankExpensesWithoutManual: number
}

export function buildFinanceAlerts(ctx: AlertContext): FinanceAlert[] {
  const alerts: FinanceAlert[] = []

  if (!ctx.bankConnection.connected) {
    alerts.push({
      id: 'bank-disconnected',
      priority: 'medium',
      title: 'Banco no conectado',
      message: 'Conecta Enable Banking para sincronizar movimientos y tener datos de caja en tiempo real.',
      action_label: 'Conectar banco',
      action_href: '/finances',
    })
  } else if (ctx.bankConnection.expires_soon) {
    alerts.push({
      id: 'bank-expiring',
      priority: 'bad',
      title: 'Conexión bancaria por caducar',
      message: `Quedan ${ctx.bankConnection.days_remaining} días para reconectar el banco.`,
      action_label: 'Reconectar',
      action_href: '/finances',
    })
  }

  if (ctx.unlinkedManualExpenses > 0) {
    alerts.push({
      id: 'expenses-unlinked',
      priority: 'medium',
      title: `${ctx.unlinkedManualExpenses} gasto(s) sin proyecto ni cliente`,
      message: `Hay ${formatEur(ctx.unlinkedManualTotal)} en gastos manuales sin asociar a proyecto o cliente. Clasifícalos para medir rentabilidad por cuenta.`,
      action_label: 'Ver gastos',
      action_href: '/finances/expenses',
    })
  }

  if (ctx.bankExpensesWithoutManual >= 5) {
    alerts.push({
      id: 'bank-expenses-unclassified',
      priority: 'medium',
      title: 'Movimientos bancarios sin registrar',
      message: `~${ctx.bankExpensesWithoutManual} salidas del banco no tienen gasto equivalente en el CRM. Regístralos o asócialos a facturas de proveedor.`,
      action_label: 'Registrar gasto',
      action_href: '/finances/expenses/manual/new',
    })
  }

  const overdue = ctx.pendingInvoices.filter((i) => i.days_overdue != null && i.days_overdue > 0)
  if (overdue.length > 0) {
    const total = overdue.reduce((s, i) => s + i.total, 0)
    alerts.push({
      id: 'invoices-overdue',
      priority: 'bad',
      title: `${overdue.length} factura(s) vencida(s) sin cobrar`,
      message: `Hay ${overdue.length} facturas enviadas sin cobro asociado por un total de ${formatEur(total)}.`,
      action_label: 'Ver facturas',
      action_href: '/invoices',
    })
  } else if (ctx.pendingInvoices.length > 0) {
    const total = ctx.pendingInvoices.reduce((s, i) => s + i.total, 0)
    alerts.push({
      id: 'invoices-pending',
      priority: 'medium',
      title: 'Cobros pendientes de conciliar',
      message: `${ctx.pendingInvoices.length} facturas enviadas sin vincular a movimiento bancario (${formatEur(total)}).`,
      action_label: 'Conciliar ingresos',
      action_href: '/finances/incomes',
    })
  }

  if (ctx.collectionRatePct != null && ctx.collectionRatePct >= 95) {
    alerts.push({
      id: 'collection-good',
      priority: 'good',
      title: 'Cobro al día este mes',
      message: `Tasa de cobro del ${ctx.collectionRatePct}% sobre lo facturado en el mes.`,
    })
  } else if (ctx.collectionGap > 500) {
    alerts.push({
      id: 'collection-gap',
      priority: 'medium',
      title: 'Brecha facturado vs cobrado',
      message: `Has facturado ${formatEur(ctx.collectionGap)} más de lo cobrado este mes.`,
    })
  }

  if (ctx.draftCount >= 3) {
    alerts.push({
      id: 'draft-invoices',
      priority: 'medium',
      title: 'Facturas en borrador',
      message: `Tienes ${ctx.draftCount} facturas en borrador sin emitir.`,
      action_label: 'Emitir facturas',
      action_href: '/invoices',
    })
  }

  if (ctx.runwayMonths !== null && ctx.runwayMonths < 3 && ctx.cashBalance > 0) {
    alerts.push({
      id: 'low-runway',
      priority: 'bad',
      title: 'Runway de caja bajo',
      message: `Con el gasto medio actual, la caja cubre ~${ctx.runwayMonths} meses.`,
    })
  } else if (ctx.runwayMonths != null && ctx.runwayMonths >= 6) {
    alerts.push({
      id: 'healthy-runway',
      priority: 'good',
      title: 'Caja saludable',
      message: `Runway de ~${ctx.runwayMonths} meses con el gasto medio actual.`,
    })
  }

  for (const p of ctx.highCostProjects.slice(0, 3)) {
    alerts.push({
      id: `project-margin-${p.id}`,
      priority: 'bad',
      title: `Margen bajo: ${p.name}`,
      message: `Coste operativo ~${formatEur(p.total_cost_eur)}/mes vs fee ${formatEur(p.monthly_fee_eur)} (margen ${p.margin_pct}%).`,
      action_label: 'Ver retención',
      action_href: `/retencion/${p.id}`,
    })
  }

  if (ctx.mrr > 0 && ctx.pipelineValue > ctx.mrr * 6) {
    alerts.push({
      id: 'strong-pipeline',
      priority: 'good',
      title: 'Pipeline comercial fuerte',
      message: `Pipeline activo (${formatEur(ctx.pipelineValue)}) supera 6× el MRR actual. Prioriza cierre.`,
      action_label: 'Ver pipelines',
      action_href: '/pipelines',
    })
  }

  if (ctx.mrr === 0 && ctx.pipelineValue === 0) {
    alerts.push({
      id: 'no-recurring',
      priority: 'medium',
      title: 'Sin MRR detectado en banco',
      message:
        'No hay ingresos recurrentes identificados en movimientos bancarios. Sincroniza el banco o revisa los cobros de mensualidad.',
      action_label: 'Sincronizar banco',
      action_href: '/finances',
    })
  }

  const order: Record<string, number> = { bad: 0, medium: 1, good: 2 }
  return alerts.sort((a, b) => order[a.priority] - order[b.priority])
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
