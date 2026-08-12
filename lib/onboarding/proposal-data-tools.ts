/**
 * Herramientas deterministas de datos para gráficos de propuesta.
 * El LLM aporta hipótesis; la aritmética la hace TypeScript.
 */

export type ChartType = 'line' | 'area' | 'bar' | 'barcompare' | 'donut' | 'pie'

export type ScenarioSeriesInput = {
  periods: number
  periodLabel: string
  baseline: number
  baselineGrowthPct: number
  upliftPct: number
  /** Etiqueta del primer periodo (ej. "Mes 1" o "Ene"). */
  startLabel?: string
  /** Nombre de la serie sin Buffalo / baseline. */
  baselineSeriesName?: string
  /** Nombre de la serie con Buffalo / uplift. */
  upliftSeriesName?: string
}

export type ScenarioSeries = {
  columns: string[]
  rows: string[][]
  /** Valores numéricos (misma forma que rows) para asserts. */
  values: { baseline: number[]; uplift: number[] }
}

function escapeCell(s: string): string {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 10) / 10
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

/**
 * Crecimiento compuesto con divergencia creciente entre baseline y uplift.
 * upliftPct es mejora relativa sobre el valor baseline de cada periodo
 * (no solo sobre el punto de partida), para que las curvas se separen.
 */
export function buildScenarioSeries(input: ScenarioSeriesInput): ScenarioSeries {
  const periods = Math.max(2, Math.min(36, Math.floor(input.periods)))
  const baselineGrowth = input.baselineGrowthPct / 100
  const uplift = input.upliftPct / 100
  const baseName = input.baselineSeriesName || 'Sin Buffalo'
  const upliftName = input.upliftSeriesName || 'Con Buffalo'
  const periodLabel = input.periodLabel.trim() || 'Periodo'

  const baselineVals: number[] = []
  const upliftVals: number[] = []
  let b = Math.max(0, input.baseline)

  for (let i = 0; i < periods; i++) {
    if (i > 0) b = b * (1 + baselineGrowth)
    const u = b * (1 + uplift)
    baselineVals.push(b)
    upliftVals.push(u)
  }

  const rows: string[][] = []
  for (let i = 0; i < periods; i++) {
    const label =
      input.startLabel && i === 0
        ? input.startLabel
        : periodLabel.toLowerCase().includes('mes')
          ? `Mes ${i + 1}`
          : `${periodLabel} ${i + 1}`
    rows.push([label, fmtNum(baselineVals[i]), fmtNum(upliftVals[i])])
  }

  return {
    columns: [periodLabel, baseName, upliftName],
    rows,
    values: { baseline: baselineVals, uplift: upliftVals },
  }
}

export type BuildChartBlockInput = {
  type: ChartType
  title: string
  columns: string[]
  rows: string[][]
  note?: string
}

/**
 * Construye un bloque :::chart válido con tabla GFM.
 * Valida nº de columnas por fila; escapa `|`.
 */
export function buildChartBlock(input: BuildChartBlockInput): string {
  const type = input.type
  const title = escapeCell(input.title || 'Gráfico')
  const columns = input.columns.map(escapeCell)
  if (columns.length < 2) {
    throw new Error('buildChartBlock: hace falta al menos categoría + una serie')
  }
  const width = columns.length
  const rows: string[][] = []
  for (const row of input.rows) {
    if (!row || row.length !== width) {
      throw new Error(
        `buildChartBlock: fila con ${row?.length ?? 0} cols, esperaba ${width}`
      )
    }
    rows.push(row.map(escapeCell))
  }
  if (rows.length < 1) {
    throw new Error('buildChartBlock: hace falta ≥1 fila de datos')
  }

  const header = `| ${columns.join(' | ')} |`
  const sep = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n')
  const chart = `:::chart{type="${type}" title="${title}"}\n${header}\n${sep}\n${body}\n:::`
  const note = (input.note || '').trim()
  if (!note) return chart
  return `${chart}\n\n*${note}*`
}

/**
 * Cambia solo el type= del primer :::chart del cuerpo (sin tocar la tabla).
 */
export function setChartTypeInBody(
  body: string,
  type: ChartType
): { ok: true; body: string } | { ok: false; error: string } {
  if (!/:::chart\b/i.test(body)) {
    return { ok: false, error: 'No hay :::chart en el cuerpo' }
  }
  const next = body.replace(/:::chart\{([^}]*)\}/i, (_m, attrs: string) => {
    let a = String(attrs)
    if (/\btype\s*=/.test(a)) {
      a = a.replace(/\btype\s*=\s*["']?[a-z]+["']?/i, `type="${type}"`)
    } else {
      a = `type="${type}" ${a}`.trim()
    }
    return `:::chart{${a}}`
  })
  if (next === body) return { ok: false, error: 'No pude cambiar el type del chart' }
  return { ok: true, body: next }
}

const CHART_OR_TABLE_BLOCK_RE = /:::chart\b[\s\S]*?:::|:::table\b[\s\S]*?:::/i

/**
 * Inserta (o sustituye) un bloque de gráfico de escenario en el cuerpo de sección.
 */
export function insertScenarioChartInBody(
  body: string,
  chartBlock: string,
  opts?: { replaceExisting?: boolean; position?: 'start' | 'end' }
): string {
  const block = chartBlock.trim()
  const replaceExisting = opts?.replaceExisting !== false
  const position = opts?.position || 'end'
  let next = body || ''

  if (replaceExisting && CHART_OR_TABLE_BLOCK_RE.test(next)) {
    next = next.replace(CHART_OR_TABLE_BLOCK_RE, block)
    // Si había más de uno, el primero se sustituyó; ok
    return next.trim()
  }

  if (position === 'start') {
    return `${block}\n\n${next}`.trim()
  }
  return `${next}\n\n${block}`.trim()
}

export const DEFAULT_SCENARIO_NOTE =
  'Escenario basado en una mejora del 25% sobre la trayectoria sin Buffalo; a validar con datos del cliente. Proyección ilustrativa — no son cifras históricas.'
