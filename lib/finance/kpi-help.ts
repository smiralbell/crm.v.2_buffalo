/** Textos de ayuda para KPIs y métricas de Finanzas */

export const KPI_HELP: Record<string, string> = {
  mrr: 'Monthly Recurring Revenue: ingreso mensual recurrente. Suma las mensualidades que marcas en Ingresos (o las detecta el banco si cobras 2+ meses seguidos al mismo cliente).',
  arr: 'Annual Recurring Revenue: MRR × 12. Proyección anual si se mantuvieran las mismas mensualidades. El objetivo de la empresa es 250.000 €/año.',
  cash: 'Saldo disponible en cuenta según el último movimiento sincronizado del banco. Incluye variación respecto al mes anterior.',
  runway: 'Meses que puedes operar con la caja actual si el gasto medio mensual se mantiene. Caja ÷ gasto medio (últimos 3 meses).',
  invoiced: 'Total facturado este mes: suma de facturas emitidas con estado «enviada» en el CRM, por fecha de emisión. No implica que ya hayas cobrado.',
  collected: 'Total cobrado este mes: facturas enviadas que ya vinculaste a un ingreso del extracto bancario en Ingresos.',
  gap: 'Brecha de cobro = Facturado − Cobrado (mes actual). Si es alto, has emitido facturas que aún no han entrado en el banco.',
  pipeline: 'Valor de oportunidades abiertas en el CRM (negociando, propuesta, reunión, contrato). Potencial futuro, no ingreso real aún.',
}

export const PERIOD_INSIGHT_HELP: Record<string, string> = {
  'Dinero en cuenta': 'Saldo al cierre del período seleccionado en el filtro de fechas, según el último movimiento del extracto.',
  Ingresos: 'Suma de movimientos positivos del banco en el período filtrado.',
  Gastos: 'Suma de movimientos negativos del banco en el período filtrado (valor absoluto).',
  'Beneficio bruto': 'Ingresos menos gastos del período, antes de impuestos.',
  'IVA a deber': 'IVA repercutido (facturas emitidas) menos IVA soportado (gastos con factura), estimado del período.',
  'Beneficio neto': 'Beneficio bruto menos IVA a deber.',
  'Imp. sociedades': 'Estimación del 15% sobre el beneficio neto (simplificado).',
  'Beneficio final': 'Lo que quedaría tras IVA e impuesto de sociedades estimados.',
}

export const ANNUAL_GOAL_HELP =
  'Objetivo de facturación anual (250.000 €). Compara lo facturado en el año con el ritmo lineal esperado.'
