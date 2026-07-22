/** Definición de una métrica descubierta sobre la BD del cliente. */
export type MetricDef = {
  /** id estable en snake_case, ej. "leads_recibidos" */
  id: string
  /** etiqueta legible, ej. "Leads recibidos" */
  label: string
  /** unidad: 'count' | 'eur' | 'seconds' | 'minutes' | 'percent' | 'text' */
  unit?: string
  /** tabla de origen para trazabilidad, ej. "leads" */
  source_table?: string | null
  /** columna temporal usada para filtrar el periodo (null = total absoluto) */
  time_column?: string | null
  /** tipo de resultado: escalar (default), serie temporal o desglose categórico */
  kind?: 'scalar' | 'series' | 'breakdown'
  /**
   * SQL plantilla de solo lectura. Debe SELECT una fila con columna `value`
   * (escalar) o filas {label, value} (serie). Usa los marcadores {{START}} y
   * {{END}} donde vayan los límites del periodo (se sustituyen por fechas ISO
   * validadas antes de ejecutar). Sin marcadores = total absoluto (sin delta).
   */
  sql: string
}

/** Resultado de ejecutar una métrica para un periodo. */
export type MetricResult = {
  def: MetricDef
  status: 'ok' | 'nodata' | 'error'
  value: number | null
  prev: number | null
  delta: number | null
  delta_pct: number | null
  /** para series: [{label, value}] */
  series?: Array<{ label: string; value: number }>
  error?: string
}

export type MetricPeriods = {
  periodStart: Date
  periodEnd: Date
  prevStart: Date
  prevEnd: Date
}

export type MetricsRunOutput = {
  results: MetricResult[]
  source: { host: string | null; db: string | null }
  generatedAt: string
  periodLabel: string
}
