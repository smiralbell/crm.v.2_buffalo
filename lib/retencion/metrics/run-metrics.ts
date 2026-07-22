import { runReadOnlySelect, assertReadOnlySelect } from '../readonly-postgres'
import type { MetricDef, MetricResult, MetricPeriods } from './types'

/** Fecha → literal SQL 'YYYY-MM-DD' validado (evita cualquier inyección). */
function isoDateLiteral(d: Date): string {
  const iso = d.toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Fecha inválida')
  return `'${iso}'`
}

function hasPeriodPlaceholders(sql: string): boolean {
  return /\{\{\s*(START|END)\s*\}\}/i.test(sql)
}

function substitutePeriod(sql: string, start: Date, end: Date): string {
  return sql
    .replace(/\{\{\s*START\s*\}\}/gi, isoDateLiteral(start))
    .replace(/\{\{\s*END\s*\}\}/gi, isoDateLiteral(end))
}

function firstNumeric(rows: Record<string, unknown>[], preferKey = 'value'): number | null {
  if (!rows.length) return null
  const row = rows[0]
  const pick = (v: unknown): number | null => {
    if (v == null) return null
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  if (preferKey in row) {
    const n = pick(row[preferKey])
    if (n != null) return n
  }
  for (const v of Object.values(row)) {
    const n = pick(v)
    if (n != null) return n
  }
  return null
}

async function runScalar(url: string, sql: string): Promise<number | null> {
  assertReadOnlySelect(sql) // defensa en profundidad
  const res = await runReadOnlySelect(url, sql, { limit: 5, timeoutMs: 12000 })
  return firstNumeric(res.rows)
}

async function runSeries(
  url: string,
  sql: string
): Promise<Array<{ label: string; value: number }>> {
  assertReadOnlySelect(sql)
  const res = await runReadOnlySelect(url, sql, { limit: 62, timeoutMs: 12000 })
  return res.rows.map((r) => {
    const keys = Object.keys(r)
    const labelKey = keys.find((k) => k !== 'value') ?? keys[0]
    const valNum = firstNumeric([r]) ?? 0
    return { label: String(r[labelKey] ?? ''), value: valNum }
  })
}

/**
 * Paso B: ejecuta cada métrica para el periodo actual y el anterior.
 * Una métrica que falle o venga vacía se marca sin datos, sin tumbar el resto.
 */
export async function runMetrics(
  url: string,
  defs: MetricDef[],
  periods: MetricPeriods
): Promise<MetricResult[]> {
  const out: MetricResult[] = []

  for (const def of defs) {
    const hasPeriod = hasPeriodPlaceholders(def.sql)
    try {
      if (def.kind === 'series' || def.kind === 'breakdown') {
        const sql = hasPeriod
          ? substitutePeriod(def.sql, periods.periodStart, periods.periodEnd)
          : def.sql
        const series = await runSeries(url, sql)
        out.push({
          def,
          status: series.length ? 'ok' : 'nodata',
          value: series.reduce((a, s) => a + s.value, 0),
          prev: null,
          delta: null,
          delta_pct: null,
          series,
        })
        continue
      }

      const curSql = hasPeriod
        ? substitutePeriod(def.sql, periods.periodStart, periods.periodEnd)
        : def.sql
      const value = await runScalar(url, curSql)

      let prev: number | null = null
      if (hasPeriod) {
        try {
          const prevSql = substitutePeriod(def.sql, periods.prevStart, periods.prevEnd)
          prev = await runScalar(url, prevSql)
        } catch {
          prev = null
        }
      }

      const delta = value != null && prev != null ? value - prev : null
      const delta_pct =
        delta != null && prev != null && prev !== 0
          ? (delta / Math.abs(prev)) * 100
          : null

      out.push({
        def,
        status: value == null ? 'nodata' : 'ok',
        value,
        prev,
        delta,
        delta_pct,
      })
    } catch (e) {
      out.push({
        def,
        status: 'error',
        value: null,
        prev: null,
        delta: null,
        delta_pct: null,
        error: e instanceof Error ? e.message.slice(0, 200) : 'error',
      })
    }
  }

  return out
}

/** Deriva los 4 límites de periodo a partir de año/mes del informe. */
export function derivePeriods(year: number, month: number): MetricPeriods {
  return {
    periodStart: new Date(Date.UTC(year, month - 1, 1)),
    periodEnd: new Date(Date.UTC(year, month, 1)),
    prevStart: new Date(Date.UTC(year, month - 2, 1)),
    prevEnd: new Date(Date.UTC(year, month - 1, 1)),
  }
}
