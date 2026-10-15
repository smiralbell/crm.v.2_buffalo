import { query } from '@/lib/db'
import { describeTable, listPublicTables, runReadOnlySelect } from '@/lib/retencion/readonly-postgres'

export type CursorKind = 'time' | 'int' | 'uuid'

export type TableWatermark = {
  schema: string
  table: string
  cursor_column: string | null
  cursor_kind: CursorKind | null
  last_value: string | null
  last_count: number | null
}

export type SchemaColumn = { column: string; data_type: string }

export type SchemaTable = {
  schema: string
  table: string
  columns: SchemaColumn[]
}

export type WatchExclusions = {
  tables: string[]
  columns: string[]
}

export type WatchDbMemory = {
  summary: string
  watermarks: TableWatermark[]
  last_delta_at: string | null
  schema_snapshot: SchemaTable[]
}

const TIME_NAMES = [
  'updated_at',
  'created_at',
  'inserted_at',
  'modified_at',
  'last_updated',
  'last_modified',
  'timestamp',
  'fecha',
  'date',
]

function ident(raw: string): string {
  const s = raw.trim()
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw new Error(`Identificador inválido: ${raw}`)
  return `"${s}"`
}

function classifyType(dataType: string): CursorKind | null {
  const t = dataType.toLowerCase()
  if (t.includes('timestamp') || t === 'date' || t.includes('time')) return 'time'
  if (t.includes('int') || t === 'bigint' || t === 'smallint' || t === 'numeric' || t === 'decimal') return 'int'
  if (t === 'uuid') return 'uuid'
  return null
}

export function pickCursorColumn(
  columns: { column: string; data_type: string }[]
): { column: string; kind: CursorKind } | null {
  const ranked: { column: string; kind: CursorKind; score: number }[] = []
  for (const c of columns) {
    const kind = classifyType(c.data_type)
    if (!kind) continue
    const name = c.column.toLowerCase()
    let score = 0
    const timeIdx = TIME_NAMES.indexOf(name)
    if (kind === 'time' && timeIdx >= 0) score = 100 - timeIdx
    else if (kind === 'time') score = 20
    else if (name === 'id' && kind === 'int') score = 15
    else if (name === 'id' && kind === 'uuid') score = 8
    else if (name.endsWith('_id') && kind === 'int') score = 5
    if (score > 0) ranked.push({ column: c.column, kind, score })
  }
  ranked.sort((a, b) => b.score - a.score)
  return ranked[0] ? { column: ranked[0].column, kind: ranked[0].kind } : null
}

function sqlLiteral(kind: CursorKind, value: string): string {
  if (kind === 'int') {
    if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error('Marca numérica inválida')
    return value
  }
  if (kind === 'uuid') {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error('Marca uuid inválida')
    }
    return `'${value}'::uuid`
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new Error('Marca temporal inválida')
  return `'${d.toISOString()}'::timestamptz`
}

function cell(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

let memoryEnsured = false
export async function ensureWatchMemoryTable(): Promise<void> {
  if (memoryEnsured) return
  await query(`
    CREATE TABLE IF NOT EXISTS retencion_watch_memory (
      proyecto_id     UUID PRIMARY KEY,
      summary         TEXT,
      schema_snapshot JSONB,
      watermarks      JSONB,
      last_delta_at   TIMESTAMPTZ,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    ALTER TABLE retencion_watch_memory
      ADD COLUMN IF NOT EXISTS schema_snapshot JSONB
  `)
  memoryEnsured = true
}

function parseSchemaSnapshot(raw: unknown): SchemaTable[] {
  if (!Array.isArray(raw)) return []
  const out: SchemaTable[] = []
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i] as Record<string, unknown>
    if (!t || typeof t.schema !== 'string' || typeof t.table !== 'string') continue
    const colsRaw = Array.isArray(t.columns) ? t.columns : []
    const columns: SchemaColumn[] = []
    for (let c = 0; c < colsRaw.length; c++) {
      const col = colsRaw[c] as Record<string, unknown>
      if (typeof col?.column === 'string' && typeof col?.data_type === 'string') {
        columns.push({ column: col.column, data_type: col.data_type })
      }
    }
    out.push({ schema: t.schema, table: t.table, columns })
  }
  return out
}

function tableKey(schema: string, table: string): string {
  return `${schema}.${table}`
}

function columnKey(schema: string, table: string, column: string): string {
  return `${schema}.${table}.${column}`
}

function exclusionSet(list: string[]): Set<string> {
  return new Set(list.map((x) => x.trim()).filter(Boolean))
}

export async function loadWatchMemory(proyectoId: string): Promise<WatchDbMemory> {
  await ensureWatchMemoryTable()
  const { rows } = await query<{
    summary: string | null
    watermarks: unknown
    last_delta_at: Date | null
    schema_snapshot: unknown
  }>(
    `SELECT summary, watermarks, last_delta_at, schema_snapshot
       FROM retencion_watch_memory
      WHERE proyecto_id = $1::uuid
      LIMIT 1`,
    [proyectoId]
  )
  const row = rows[0]
  const watermarks = Array.isArray(row?.watermarks) ? (row!.watermarks as TableWatermark[]) : []
  return {
    summary: row?.summary?.trim() || '',
    watermarks,
    last_delta_at: row?.last_delta_at ? new Date(row.last_delta_at).toISOString() : null,
    schema_snapshot: parseSchemaSnapshot(row?.schema_snapshot),
  }
}

export async function saveWatchMemory(proyectoId: string, memory: WatchDbMemory): Promise<void> {
  await ensureWatchMemoryTable()
  await query(
    `INSERT INTO retencion_watch_memory (proyecto_id, summary, schema_snapshot, watermarks, last_delta_at, updated_at)
     VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb, $5::timestamptz, NOW())
     ON CONFLICT (proyecto_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       schema_snapshot = COALESCE(EXCLUDED.schema_snapshot, retencion_watch_memory.schema_snapshot),
       watermarks = EXCLUDED.watermarks,
       last_delta_at = EXCLUDED.last_delta_at,
       updated_at = NOW()`,
    [
      proyectoId,
      memory.summary || null,
      JSON.stringify(memory.schema_snapshot || []),
      JSON.stringify(memory.watermarks),
      memory.last_delta_at,
    ]
  )
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n…[truncado]` : s
}

export type TableDelta = {
  schema: string
  table: string
  cursor: string | null
  new_rows: number
  truncated: boolean
  sample: Record<string, unknown>[]
  note?: string
}

function stripExcludedColumns(
  rows: Record<string, unknown>[],
  schema: string,
  table: string,
  excludedCols: Set<string>
): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {}
    const keys = Object.keys(row)
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      if (excludedCols.has(columnKey(schema, table, k))) continue
      out[k] = row[k]
    }
    return out
  })
}

async function pullTableDelta(
  dbUrl: string,
  prev: TableWatermark | undefined,
  schema: string,
  table: string,
  columns: SchemaColumn[],
  approxRows: number | null,
  excludedCols: Set<string>
): Promise<{ delta: TableDelta; watermark: TableWatermark }> {
  const visible = columns.filter((c) => !excludedCols.has(columnKey(schema, table, c.column)))
  const cursor = pickCursorColumn(columns)
  const wm: TableWatermark = {
    schema,
    table,
    cursor_column: cursor?.column || null,
    cursor_kind: cursor?.kind || null,
    last_value: prev?.last_value || null,
    last_count: approxRows,
  }

  if (!visible.length) {
    return {
      delta: {
        schema,
        table,
        cursor: cursor?.column || null,
        new_rows: 0,
        truncated: false,
        sample: [],
        note: 'Todas las columnas de esta tabla están excluidas.',
      },
      watermark: wm,
    }
  }

  if (!cursor) {
    const changed =
      prev?.last_count != null && approxRows != null && approxRows !== prev.last_count
    return {
      delta: {
        schema,
        table,
        cursor: null,
        new_rows: 0,
        truncated: false,
        sample: [],
        note: changed
          ? `Sin columna temporal. Recuento aproximado ${prev?.last_count} → ${approxRows}. No se vuelca la tabla.`
          : 'Sin columna temporal/id usable. Solo se guarda el recuento; no se extrae el histórico.',
      },
      watermark: wm,
    }
  }

  const selectNames: string[] = []
  const seen = new Set<string>()
  const addCol = (name: string) => {
    if (seen.has(name)) return
    seen.add(name)
    selectNames.push(name)
  }
  addCol(cursor.column)
  for (let i = 0; i < visible.length; i++) addCol(visible[i].column)

  const fq = `${ident(schema)}.${ident(table)}`
  const col = ident(cursor.column)
  const selectSql = selectNames.map(ident).join(', ')
  const firstRun = !prev?.last_value
  let sql: string
  if (firstRun) {
    sql = `SELECT ${selectSql} FROM ${fq} ORDER BY ${col} DESC`
  } else {
    const lit = sqlLiteral(cursor.kind, prev.last_value as string)
    sql = `SELECT ${selectSql} FROM ${fq} WHERE ${col} > ${lit} ORDER BY ${col} ASC`
  }

  const r = await runReadOnlySelect(dbUrl, sql, { limit: 80 })
  const sample = stripExcludedColumns(r.rows, schema, table, excludedCols)
  let lastValue = prev?.last_value || null
  if (r.rows.length) {
    const values = r.rows.map((row) => cell(row[cursor.column])).filter(Boolean)
    lastValue = firstRun ? values[0] || lastValue : values[values.length - 1] || lastValue
  }

  wm.last_value = lastValue

  return {
    delta: {
      schema,
      table,
      cursor: cursor.column,
      new_rows: sample.length,
      truncated: r.truncated,
      sample: firstRun ? sample.slice(0, 25) : sample,
      note: firstRun
        ? 'Primera pasada: solo filas recientes (no el histórico). A partir de aquí, solo lo nuevo.'
        : undefined,
    },
    watermark: wm,
  }
}

export async function syncWatchSchema(proyectoId: string, dbUrl: string): Promise<SchemaTable[]> {
  const tables = await listPublicTables(dbUrl)
  const snapshot: SchemaTable[] = []
  const chunk = 8
  for (let i = 0; i < tables.length; i += chunk) {
    const part = tables.slice(i, i + chunk)
    const described = await Promise.all(
      part.map(async (t) => {
        const cols = await describeTable(dbUrl, t.schema, t.table)
        return {
          schema: t.schema,
          table: t.table,
          columns: cols.map((c) => ({ column: c.column, data_type: c.data_type })),
        } as SchemaTable
      })
    )
    snapshot.push(...described)
  }
  const prev = await loadWatchMemory(proyectoId)
  await saveWatchMemory(proyectoId, {
    ...prev,
    schema_snapshot: snapshot,
  })
  return snapshot
}

export async function collectWatchDbDelta(
  proyectoId: string,
  dbUrl: string,
  exclusions: WatchExclusions = { tables: [], columns: [] }
): Promise<{ briefing: string; deltas: TableDelta[]; nextMemory: WatchDbMemory }> {
  const prev = await loadWatchMemory(proyectoId)
  let schema = prev.schema_snapshot
  if (!schema.length) {
    schema = await syncWatchSchema(proyectoId, dbUrl)
  }
  const skipTables = exclusionSet(exclusions.tables)
  const skipCols = exclusionSet(exclusions.columns)
  const tables = await listPublicTables(dbUrl)
  const approxByKey = new Map(tables.map((t) => [tableKey(t.schema, t.table), t.approx_rows]))
  const deltas: TableDelta[] = []
  const watermarks: TableWatermark[] = []
  const prevByKey = new Map(prev.watermarks.map((w) => [tableKey(w.schema, w.table), w]))

  let included = 0
  for (let i = 0; i < schema.length; i++) {
    const t = schema[i]
    const key = tableKey(t.schema, t.table)
    const prevWm = prevByKey.get(key)
    if (skipTables.has(key)) {
      if (prevWm) watermarks.push(prevWm)
      continue
    }
    if (included >= 100) {
      if (prevWm) watermarks.push(prevWm)
      continue
    }
    included += 1
    try {
      const { delta, watermark } = await pullTableDelta(
        dbUrl,
        prevWm,
        t.schema,
        t.table,
        t.columns,
        approxByKey.get(key) ?? null,
        skipCols
      )
      watermarks.push(watermark)
      if (delta.new_rows > 0 || delta.note) deltas.push(delta)
    } catch (e) {
      watermarks.push(
        prevWm || {
          schema: t.schema,
          table: t.table,
          cursor_column: null,
          cursor_kind: null,
          last_value: null,
          last_count: approxByKey.get(key) ?? null,
        }
      )
      deltas.push({
        schema: t.schema,
        table: t.table,
        cursor: null,
        new_rows: 0,
        truncated: false,
        sample: [],
        note: `No se pudo leer: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  const nextMemory: WatchDbMemory = {
    summary: prev.summary,
    watermarks,
    last_delta_at: new Date().toISOString(),
    schema_snapshot: schema,
  }

  const briefing = clip(
    [
      prev.last_delta_at ? `Última ingestión: ${prev.last_delta_at}` : 'No había ingestión previa.',
      '## Datos NUEVOS desde la última pasada',
      JSON.stringify(
        deltas.map((d) => ({
          table: `${d.schema}.${d.table}`,
          cursor: d.cursor,
          new_rows: d.new_rows,
          truncated: d.truncated,
          note: d.note,
          sample: d.sample,
        })),
        null,
        2
      ),
    ].join('\n\n'),
    22000
  )

  return { briefing, deltas, nextMemory }
}
