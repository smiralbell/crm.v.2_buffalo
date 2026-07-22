import type { MetricResult } from './types'

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function periodLabel(year: number, month: number): string {
  const n = MONTHS_ES[Math.min(Math.max(month - 1, 0), 11)]
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${year}`
}

/** Número en es-ES (miles con punto, decimales con coma). */
function fmtNumber(n: number, decimals = 0): string {
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Convierte una etiqueta de serie (fecha ISO o texto) en día "01".."31". */
function dayLabel(label: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(label)
  if (m) return m[3]
  return label
}

function fmtValue(value: number, unit?: string): string {
  switch (unit) {
    case 'eur':
      return `${fmtNumber(value, value % 1 === 0 ? 0 : 2)} €`
    case 'percent':
      return `${fmtNumber(value, 1)}%`
    case 'seconds': {
      const m = Math.floor(value / 60)
      const s = Math.round(value % 60)
      return m > 0 ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`
    }
    case 'minutes':
      return `${fmtNumber(value, 1)} min`
    default:
      return fmtNumber(value, value % 1 === 0 ? 0 : 2)
  }
}

function fmtDelta(r: MetricResult): string {
  if (r.prev == null || r.delta == null) return ''
  const sign = r.delta > 0 ? '+' : r.delta < 0 ? '' : '±'
  const deltaStr = `${sign}${fmtValue(r.delta, r.def.unit)}`
  const pct =
    r.delta_pct != null
      ? `, ${r.delta_pct > 0 ? '+' : ''}${fmtNumber(r.delta_pct, 1)}%`
      : ''
  return ` (mes anterior ${fmtValue(r.prev, r.def.unit)}, ${deltaStr}${pct})`
}

/**
 * Paso C: convierte los resultados en el bloque de texto REAL_METRICS que
 * ve el prompt maestro. Números en es-ES, con tabla de origen para trazabilidad.
 */
export function formatMetrics(input: {
  results: MetricResult[]
  year: number
  month: number
  host?: string | null
  db?: string | null
}): string {
  const { results, year, month } = input
  const per = periodLabel(year, month)
  const fecha = new Date().toLocaleDateString('es-ES')
  const source = `${input.host || 'BD cliente'}${input.db ? `/${input.db}` : ''}`

  const scalarLines: string[] = []
  const seriesBlocks: string[] = []
  const breakdownBlocks: string[] = []
  const compareRows: string[] = []
  const nodata: string[] = []

  for (const r of results) {
    const table = r.def.source_table
      ? ` [${r.def.source_table}${r.def.time_column ? `.${r.def.time_column}` : ''}]`
      : ' [derivada]'

    // Series temporales
    if (r.def.kind === 'series') {
      if (r.status === 'ok' && r.series?.length) {
        const pairs = r.series
          .map((s) => `${dayLabel(s.label)}=${fmtNumber(s.value)}`)
          .join(' ')
        seriesBlocks.push(`SERIE · ${r.def.label}${table}:\n${pairs}`)
      } else nodata.push(r.def.label)
      continue
    }

    // Desgloses categóricos
    if (r.def.kind === 'breakdown') {
      if (r.status === 'ok' && r.series?.length) {
        const pairs = r.series
          .map((s) => `${s.label || '(sin dato)'}=${fmtNumber(s.value)}`)
          .join(' · ')
        breakdownBlocks.push(`DESGLOSE · ${r.def.label}${table}:\n${pairs}`)
      } else nodata.push(r.def.label)
      continue
    }

    // Escalares
    if (r.status !== 'ok' || r.value == null) {
      nodata.push(r.def.label)
      continue
    }
    scalarLines.push(`- ${r.def.label}: ${fmtValue(r.value, r.def.unit)}${fmtDelta(r)}${table}`)
    if (r.prev != null) {
      compareRows.push(
        `${r.def.label} | ${fmtValue(r.value, r.def.unit)} | ${fmtValue(r.prev, r.def.unit)}`
      )
    }
  }

  const sections: string[] = []
  sections.push(
    `ESCALARES:\n${scalarLines.length ? scalarLines.join('\n') : '(sin escalares con datos)'}`
  )
  if (compareRows.length) {
    sections.push(
      `COMPARATIVA (mes actual vs anterior) [para barcompare]:\nMétrica | Actual | Anterior\n${compareRows.join('\n')}`
    )
  }
  if (seriesBlocks.length) sections.push(seriesBlocks.join('\n\n'))
  if (breakdownBlocks.length) sections.push(breakdownBlocks.join('\n\n'))

  const nodataLine = nodata.length
    ? `Métricas sin datos este periodo: ${nodata.join(', ')}`
    : 'Métricas sin datos este periodo: (ninguna)'

  return `=== REAL_METRICS (datos reales de la BD del cliente, periodo ${per}) ===
Fuente: ${source} · Consultas de solo lectura · Generado ${fecha}

${sections.join('\n\n')}
${nodataLine}
=== fin REAL_METRICS ===`
}

/** True si hay al menos una métrica con datos reales. */
export function hasRealData(results: MetricResult[]): boolean {
  return results.some((r) => r.status === 'ok' && r.value != null)
}
