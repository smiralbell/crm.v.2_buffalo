/** Tipos y helpers de IVA trimestral / modelo 303 (sin DB — seguro en cliente). */

export type IvaQuarterPoint = {
  quarter_key: string
  label: string
  iva_cobrado: number
  iva_gastos: number
  /** IVA cobrado − IVA gastos del trimestre (cálculo CRM) */
  liquidacion: number
  /** Importe del pago I.V.A. MODELO 303 que liquida este trimestre (gestoría) */
  pago_303: number
  pago_303_date: string | null
  /** liquidacion − pago_303 (positivo = CRM más alto que gestoría) */
  diferencia: number
  cobros_count: number
  gastos_count: number
}

/**
 * Trimestre que liquida un pago 303
 * (plazo AEAT: ene→T4 ant., abr→T1, jul→T2, oct→T3)
 */
export function quarterKeySettledBy303Payment(dateStr: string): string | null {
  const [ys, ms] = dateStr.slice(0, 10).split('-').map(Number)
  if (!ys || !ms) return null
  if (ms >= 1 && ms <= 3) return `${ys - 1}-Q4`
  if (ms >= 4 && ms <= 6) return `${ys}-Q1`
  if (ms >= 7 && ms <= 9) return `${ys}-Q2`
  return `${ys}-Q3`
}
