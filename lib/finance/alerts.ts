import type { BankConnectionStatus } from '@/lib/enable-banking/connection-status'
import type { FinanceAlert, PendingInvoiceRow, ProjectEconomicsRow } from './types'

interface AlertContext {
  bankConnection: BankConnectionStatus
  collectionGap: number
  pendingInvoices: PendingInvoiceRow[]
  draftCount: number
  runwayMonths: number | null
  cashBalance: number
  highCostProjects: ProjectEconomicsRow[]
  mrr: number
  pipelineValue: number
}

export function buildFinanceAlerts(ctx: AlertContext): FinanceAlert[] {
  const alerts: FinanceAlert[] = []

  if (!ctx.bankConnection.connected) {
    alerts.push({
      id: 'bank-disconnected',
      severity: 'warning',
      title: 'Banco no conectado',
      message: 'Conecta Enable Banking para sincronizar movimientos y tener datos de caja en tiempo real.',
      action_label: 'Conectar banco',
      action_href: '/finances',
    })
  } else if (ctx.bankConnection.expires_soon) {
    alerts.push({
      id: 'bank-expiring',
      severity: 'critical',
      title: 'Conexión bancaria por caducar',
      message: `Quedan ${ctx.bankConnection.days_remaining} días para reconectar el banco.`,
      action_label: 'Reconectar',
      action_href: '/finances',
    })
  }

  const overdue = ctx.pendingInvoices.filter((i) => i.days_overdue != null && i.days_overdue > 0)
  if (overdue.length > 0) {
    const total = overdue.reduce((s, i) => s + i.total, 0)
    alerts.push({
      id: 'invoices-overdue',
      severity: 'critical',
      title: `${overdue.length} factura(s) vencida(s) sin cobrar`,
      message: `Hay ${overdue.length} facturas enviadas sin cobro asociado por un total de ${formatEur(total)}.`,
      action_label: 'Ver facturas',
      action_href: '/invoices',
    })
  } else if (ctx.pendingInvoices.length > 0) {
    const total = ctx.pendingInvoices.reduce((s, i) => s + i.total, 0)
    alerts.push({
      id: 'invoices-pending',
      severity: 'warning',
      title: 'Cobros pendientes',
      message: `${ctx.pendingInvoices.length} facturas enviadas sin vincular a movimiento bancario (${formatEur(total)}).`,
      action_label: 'Conciliar ingresos',
      action_href: '/finances/incomes',
    })
  }

  if (ctx.collectionGap > 500) {
    alerts.push({
      id: 'collection-gap',
      severity: 'warning',
      title: 'Brecha facturado vs cobrado este mes',
      message: `Has facturado ${formatEur(ctx.collectionGap)} más de lo cobrado este mes.`,
    })
  }

  if (ctx.draftCount >= 3) {
    alerts.push({
      id: 'draft-invoices',
      severity: 'info',
      title: 'Facturas en borrador',
      message: `Tienes ${ctx.draftCount} facturas en borrador sin emitir.`,
      action_label: 'Emitir facturas',
      action_href: '/invoices',
    })
  }

  if (ctx.runwayMonths !== null && ctx.runwayMonths < 3 && ctx.cashBalance > 0) {
    alerts.push({
      id: 'low-runway',
      severity: 'critical',
      title: 'Runway de caja bajo',
      message: `Con el gasto medio actual, la caja cubre ~${ctx.runwayMonths} meses.`,
    })
  }

  for (const p of ctx.highCostProjects.slice(0, 3)) {
    alerts.push({
      id: `project-margin-${p.id}`,
      severity: 'warning',
      title: `Margen bajo: ${p.name}`,
      message: `Coste operativo ~${formatEur(p.total_cost_eur)}/mes vs fee ${formatEur(p.monthly_fee_eur)} (margen ${p.margin_pct}%). Revisa pricing o uso.`,
      action_label: 'Ver retención',
      action_href: `/retencion/${p.id}`,
    })
  }

  if (ctx.mrr > 0 && ctx.pipelineValue > ctx.mrr * 6) {
    alerts.push({
      id: 'strong-pipeline',
      severity: 'info',
      title: 'Pipeline comercial fuerte',
      message: `Pipeline activo (${formatEur(ctx.pipelineValue)}) supera 6× el MRR actual. Prioriza cierre.`,
      action_label: 'Ver pipelines',
      action_href: '/pipelines',
    })
  }

  if (ctx.mrr === 0 && ctx.pipelineValue === 0) {
    alerts.push({
      id: 'no-recurring',
      severity: 'info',
      title: 'Sin MRR registrado',
      message: 'No hay proyectos activos con mensualidad. Activa clientes en Retención para medir ingresos recurrentes.',
      action_label: 'Retención',
      action_href: '/retencion',
    })
  }

  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => order[a.severity] - order[b.severity])
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
