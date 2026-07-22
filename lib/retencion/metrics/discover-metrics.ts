import { describeTable, listPublicTables } from '../readonly-postgres'
import { assertReadOnlySelect } from '../readonly-postgres'
import { openRouterChatCompletion, parseJsonFromModelOutput } from '@/lib/openrouter'
import type { MetricDef } from './types'

const DISCOVER_MODEL =
  process.env.RETENCION_OPENROUTER_MODEL ||
  process.env.OPENROUTER_MODEL ||
  'anthropic/claude-sonnet-4'

const TIME_COLUMN_HINTS = [
  'created_at',
  'fecha',
  'created',
  'timestamp',
  'date',
  'inserted_at',
  'started_at',
  'fecha_creacion',
  'creado_en',
]

type SchemaTable = {
  schema: string
  table: string
  approx_rows: number | null
  columns: { column: string; data_type: string; is_nullable: string }[]
}

/** Lee el schema real (tablas + columnas) de las tablas candidatas. */
export async function readSchema(
  url: string,
  maxTables = 25
): Promise<SchemaTable[]> {
  const tables = await listPublicTables(url)
  // Prioriza tablas con filas (las vacías/system al final)
  const sorted = [...tables].sort(
    (a, b) => (b.approx_rows ?? 0) - (a.approx_rows ?? 0)
  )
  const out: SchemaTable[] = []
  for (const t of sorted.slice(0, maxTables)) {
    try {
      const columns = await describeTable(url, t.schema, t.table)
      out.push({ ...t, columns })
    } catch {
      // ignora tabla que no se pueda describir
    }
  }
  return out
}

function schemaToText(schema: SchemaTable[]): string {
  return schema
    .map((t) => {
      const cols = t.columns
        .map((c) => `${c.column} ${c.data_type}`)
        .join(', ')
      const rows = t.approx_rows != null ? ` (~${t.approx_rows} filas)` : ''
      return `- ${t.schema}.${t.table}${rows}: ${cols}`
    })
    .join('\n')
}

function guessTimeColumn(schema: SchemaTable[], table: string): string | null {
  const t = schema.find((s) => s.table === table)
  if (!t) return null
  for (const hint of TIME_COLUMN_HINTS) {
    const found = t.columns.find((c) => c.column.toLowerCase() === hint)
    if (found) return found.column
  }
  const anyTs = t.columns.find((c) => /timestamp|date/i.test(c.data_type))
  return anyTs?.column ?? null
}

/** Valida y normaliza una definición de métrica devuelta por el modelo. */
function sanitizeDef(raw: unknown, schema: SchemaTable[]): MetricDef | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = String(o.id || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const label = String(o.label || '').trim()
  const sql = String(o.sql || '').trim()
  if (!id || !label || !sql) return null

  // Solo SELECT/WITH; rechaza cualquier otra cosa (defensa en profundidad)
  try {
    // sustituye marcadores por una fecha dummy para poder validar sintaxis básica
    const probe = sql
      .replace(/\{\{\s*START\s*\}\}/gi, "'2000-01-01'")
      .replace(/\{\{\s*END\s*\}\}/gi, "'2000-02-01'")
    assertReadOnlySelect(probe)
  } catch {
    return null
  }
  const kind =
    o.kind === 'series' ? 'series' : o.kind === 'breakdown' ? 'breakdown' : 'scalar'

  // Los escalares deben devolver una columna "value"; series/desgloses devuelven filas
  if (kind === 'scalar' && !/\bvalue\b/i.test(sql)) return null

  const source_table = o.source_table ? String(o.source_table) : null
  const time_column =
    o.time_column != null
      ? String(o.time_column)
      : source_table
        ? guessTimeColumn(schema, source_table)
        : null

  const unit = o.unit ? String(o.unit) : 'count'

  return { id, label, unit, source_table, time_column, kind, sql }
}

/**
 * Paso A: schema real + tipo de producto → definiciones de métrica (LLM).
 */
export async function discoverMetrics(input: {
  url: string
  productType?: string
  knowledgeHint?: string
}): Promise<{ defs: MetricDef[]; schemaTables: number }> {
  const schema = await readSchema(input.url)
  if (schema.length === 0) return { defs: [], schemaTables: 0 }

  const system = `Eres un analista de datos. Recibes el schema real de la BD de un cliente y el tipo de producto. Devuelve una lista de MÉTRICAS DE NEGOCIO mensuales calculables con SQL de agregación (solo SELECT). Debes proponer TRES clases de métrica:

1) ESCALAR (kind:"scalar"): un total con delta mes vs mes.
   - SELECT que devuelva UNA fila con columna "value" numérica. Ej: SELECT COUNT(*) AS value FROM leads WHERE created_at >= {{START}} AND created_at < {{END}}

2) SERIE temporal (kind:"series"): evolución por día del periodo (para gráfico de línea).
   - SELECT date_trunc('day', <col_tiempo>) AS dia, COUNT(*) AS value FROM <tabla> WHERE <col_tiempo> >= {{START}} AND <col_tiempo> < {{END}} GROUP BY 1 ORDER BY 1
   - Propón 2–3 series de las métricas de VOLUMEN principales.

3) DESGLOSE categórico (kind:"breakdown"): reparto por categoría (para donut/barras).
   - SELECT COALESCE(<col_categoria>::text,'(sin dato)') AS categoria, COUNT(*) AS value FROM <tabla> WHERE <col_tiempo> >= {{START}} AND <col_tiempo> < {{END}} GROUP BY 1 ORDER BY 2 DESC LIMIT 8
   - Propón 2–3 desgloses útiles (por origen/canal/estado/outcome…).

REGLAS SQL (obligatorias):
- Marcadores literales {{START}} (inclusivo) y {{END}} (exclusivo) sobre la columna temporal. NO los entrecomilles (ya se sustituyen por fechas ISO entre comillas).
- Si una tabla NO tiene columna temporal, omite el WHERE de periodo (total absoluto, sin delta).
- Nombres de tabla/columna EXACTOS del schema. Solo SELECT/WITH; nada de escrituras.
- La primera columna de series/desgloses es la etiqueta (día o categoría), la segunda "value".

Devuelve SOLO JSON válido:
{ "metrics": [ { "id":"snake_case", "label":"Texto", "unit":"count|eur|seconds|minutes|percent", "kind":"scalar|series|breakdown", "source_table":"tabla", "time_column":"col|null", "sql":"SELECT ..." } ] }

Entre 10 y 18 métricas en total (mezcla de las 3 clases). Solo lo que el schema soporte.`

  const user = `TIPO DE PRODUCTO: ${input.productType || 'no especificado'}
${input.knowledgeHint ? `NOTAS DE CONTEXTO:\n${input.knowledgeHint.slice(0, 2000)}\n` : ''}
SCHEMA REAL:
${schemaToText(schema)}`

  const raw = await openRouterChatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { model: DISCOVER_MODEL, temperature: 0.2, maxTokens: 3000 }
  )

  let parsed: unknown
  try {
    parsed = parseJsonFromModelOutput(raw)
  } catch {
    return { defs: [], schemaTables: schema.length }
  }
  const list = Array.isArray((parsed as { metrics?: unknown })?.metrics)
    ? (parsed as { metrics: unknown[] }).metrics
    : Array.isArray(parsed)
      ? (parsed as unknown[])
      : []

  const defs: MetricDef[] = []
  const seen = new Set<string>()
  for (const item of list) {
    const def = sanitizeDef(item, schema)
    if (def && !seen.has(def.id)) {
      seen.add(def.id)
      defs.push(def)
    }
  }
  return { defs, schemaTables: schema.length }
}
