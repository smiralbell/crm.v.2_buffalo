/** Textos de ayuda para KPIs y métricas de Finanzas */

export const KPI_HELP: Record<string, string> = {
  mrr: 'Monthly Recurring Revenue: ingreso mensual recurrente. Solo cuenta cobros que marques manualmente en Ingresos con «Marcar MRR». Sin etiquetas, MRR = 0 €.',
  arr: 'Annual Recurring Revenue: MRR × 12. Proyección anual si se mantuvieran las mismas mensualidades. El objetivo de la empresa es 250.000 €/año.',
  cash: 'Saldo disponible en cuenta según el último movimiento sincronizado del banco. Incluye variación respecto al mes anterior.',
  runway: 'Meses de caja si solo mantienes el gasto medio en plataformas/SaaS (Twilio, Cursor, PLT…). Saldo ÷ media mensual de plataformas (últimos meses con datos). No incluye nóminas ni developers.',
  invoiced: 'Total facturado en el período: facturas «enviadas» por fecha de emisión. No implica cobro.',
  collected: 'Total cobrado en el período: facturas vinculadas a un movimiento bancario, por fecha del extracto (no por emisión).',
  gap: 'Brecha = Facturado (emisión) − Cobrado (fecha banco) en el período filtrado. Si es alta, hay facturas emitidas sin cobro en banco o cobros fuera de fechas.',
  pipeline: 'Valor de oportunidades abiertas en el CRM (negociando, propuesta, reunión, contrato). Potencial futuro, no ingreso real aún.',
}

export const PERIOD_INSIGHT_HELP: Record<string, string> = {
  'Dinero en cuenta': 'Saldo vivo según el último movimiento sincronizado (no depende del filtro de fechas).',
  Ingresos: 'Suma de movimientos positivos del banco en el período filtrado.',
  Gastos: 'Suma de movimientos negativos del banco en el período filtrado (valor absoluto).',
  'Beneficio bruto': 'Ingresos menos gastos del período (caja), antes de impuestos.',
  'IVA a deber': 'IVA repercutido menos soportado del período, solo con facturas/gastos vinculados. Estimación.',
  'Beneficio neto': 'Resultado fiscal estimado tras IVA.',
  'Imp. sociedades': 'Estimación del % de IS configurado en ajustes sobre el resultado fiscal del período.',
  'Beneficio final': 'Estimación tras IVA e impuesto de sociedades. No sustituye a gestoría.',
}

export const ANNUAL_GOAL_HELP =
  'Objetivo de facturación anual (250.000 €). Compara lo facturado en el año con el ritmo lineal esperado.'
