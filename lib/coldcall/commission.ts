/** Reglas de comisión del cold caller (reunión agendada → venta cerrada por el closer). */
export const COMMISSION = {
  /** Ticket medio por venta cerrada (€). */
  saleTicketEur: 3500,
  /** Tasa de cierre del closer: reunión → venta (30%). */
  benchmarkCloseRate: 0.3,
  /** Comisión del caller sobre cada venta cerrada (10% del ticket). */
  commissionRate: 0.1,
  /** Ejemplo de referencia para el comercial (reuniones/semana). */
  referenceMeetingsPerWeek: 10,
  weeksPerMonth: 4,
  weeksPerYear: 52,
} as const

export type CloseRateSource = 'historical' | 'benchmark'

export interface CommissionProjection {
  meetings: number
  closeRate: number
  closeRatePct: number
  closeRateSource: CloseRateSource
  estimatedSales: number
  perSaleCommission: number
  commissionEur: number
  monthlyCommission: number
  yearlyCommission: number
}

/** 10% de 3.500 € = 350 € por cada venta que cierre el closer. */
export function commissionPerClosedSale(ticketEur = COMMISSION.saleTicketEur): number {
  return Math.round(ticketEur * COMMISSION.commissionRate)
}

export function projectCommission(input: {
  meetings: number
  closeRate?: number
  closeRateSource?: CloseRateSource
}): CommissionProjection {
  const meetings = Math.max(0, input.meetings)
  const closeRate = input.closeRate ?? COMMISSION.benchmarkCloseRate
  const closeRateSource = input.closeRateSource ?? 'benchmark'
  const perSaleCommission = commissionPerClosedSale()
  const estimatedSales = meetings * closeRate
  /** ventas × 350 € — no es un pago fijo por reunión. */
  const commissionEur = Math.round(estimatedSales * perSaleCommission)

  return {
    meetings,
    closeRate,
    closeRatePct: Math.round(closeRate * 100),
    closeRateSource,
    estimatedSales: Math.round(estimatedSales * 10) / 10,
    perSaleCommission,
    commissionEur,
    monthlyCommission: Math.round(commissionEur * COMMISSION.weeksPerMonth),
    yearlyCommission: Math.round(commissionEur * COMMISSION.weeksPerYear),
  }
}

export function referenceWeekProjection(): CommissionProjection {
  return projectCommission({ meetings: COMMISSION.referenceMeetingsPerWeek })
}

export function formatCommissionFormula(projection: CommissionProjection): string {
  const sales = formatEstimatedSales(projection.estimatedSales)
  return (
    `${projection.meetings} reunión${projection.meetings === 1 ? '' : 'es'} × ` +
    `${projection.closeRatePct}% cierre = ${sales} venta${projection.estimatedSales === 1 ? '' : 's'} × ` +
    `${formatEur(projection.perSaleCommission)}/venta = ${formatEur(projection.commissionEur)}`
  )
}

/** @deprecated Usar projectCommission */
export function potentialEarningsFromMeetings(
  meetingCount: number,
  closeRate?: number
): number {
  return projectCommission({ meetings: meetingCount, closeRate }).commissionEur
}

/** @deprecated Usar projectCommission */
export function expectedCommissionPerMeeting(closeRate?: number): number {
  return projectCommission({ meetings: 1, closeRate }).commissionEur
}

export function formatEur(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatEstimatedSales(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

export function closeRateLabel(source: CloseRateSource, pct: number): string {
  if (source === 'historical') return `cierre real del closer (${pct}%)`
  return `cierre del closer (${pct}%)`
}
