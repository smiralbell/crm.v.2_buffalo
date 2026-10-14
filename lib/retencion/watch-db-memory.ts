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

export type WatchDbMemory = {
  summary: string
  watermarks: TableWatermark[]
  last_delta_at: string | null
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
  memoryEnsured = true
}

export async function loadWatchMemory(proyectoId: string): Promise<WatchDbMemory> {
  await ensureWatchMemoryTable()
  const { rows } = await query<{
    summary: string | null
    watermarks: unknown
    last_delta_at: Date | null
  }>(
    `SELECT summary, watermarks, last_delta_at
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
  }
}

export async function saveWatchMemory(proyectoId: string, memory: WatchDbMemory): Promise<void> {
  await ensureWatchMemoryTable()
  await query(
    `INSERT INTO retencion_watch_memory (proyecto_id, summary, watermarks, last_delta_at, updated_at)
     VALUES ($1::uuid, $2, $3::jsonb, $4::timestamptz, NOW())
     ON CONFLICT (proyecto_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       watermarks = EXCLUDED.watermarks,
       last_delta_at = EXCLUDED.last_delta_at,
       updated_at = NOW()`,
    [
      proyectoId,
      memory.summary || null,
      JSON.stringify(memory.watermarks),
      memory.last_delta_at,
    ]
  )
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n…[truncado]` : s
}

type TableDelta = {
  schema: string
  table: string
  cursor: string | null
  new_rows: number
  truncated: boolean
  sample: Record<string, unknown>[]
  note?: string
}

async function pullTableDelta(
  dbUrl: string,
  prev: TableWatermark | undefined,
  schema: string,
  table: string,
  columns: { column: string; data_type: string }[],
  approxRows: number | null
): Promise<{ delta: TableDelta; watermark: TableWatermark }> {
  const cursor = pickCursorColumn(columns)
  const wm: TableWatermark = {
    schema,
    table,
    cursor_column: cursor?.column || null,
    cursor_kind: cursor?.kind || null,
    last_value: prev?.last_value || null,
    last_count: approxRows,
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

  const fq = `${ident(schema)}.${ident(table)}`
  const col = ident(cursor.column)
  const firstRun = !prev?.last_value
  let sql: string
  if (firstRun) {
    sql = `SELECT * FROM ${fq} ORDER BY ${col} DESC`
  } else {
    const lit = sqlLiteral(cursor.kind, prev.last_value as string)
    sql = `SELECT * FROM ${fq} WHERE ${col} > ${lit} ORDER BY ${col} ASC`
  }

  const r = await runReadOnlySelect(dbUrl, sql, { limit: 80 })
  const sample = r.rows
  let lastValue = prev?.last_value || null
  if (sample.length) {
    const values = sample.map((row) => cell(row[cursor.column])).filter(Boolean)
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
        ? 'Primera pasada: muestra reciente (no el histórico completo). La marca queda en el máximo visto.'
        : undefined,
    },
    watermark: wm,
  }
}

export async function collectWatchDbDelta(
  proyectoId: string,
  dbUrl: string
): Promise<{ briefing: string; nextMemory: WatchDbMemory }> {
  const prev = await loadWatchMemory(proyectoId)
  const tables = await listPublicTables(dbUrl)
  const slice = tables.slice(0, 25)
  const deltas: TableDelta[] = []
  const watermarks: TableWatermark[] = []
  const prevByKey = new Map(prev.watermarks.map((w) => [`${w.schema}.${w.table}`, w]))

  for (const t of slice) {
    try {
      const cols = await describeTable(dbUrl, t.schema, t.table)
      const { delta, watermark } = await pullTableDelta(
        dbUrl,
        prevByKey.get(`${t.schema}.${t.table}`),
        t.schema,
        t.table,
        cols,
        t.approx_rows
      )
      watermarks.push(watermark)
      if (delta.new_rows > 0 || delta.note) deltas.push(delta)
    } catch (e) {
      watermarks.push(
        prevByKey.get(`${t.schema}.${t.table}`) || {
          schema: t.schema,
          table: t.table,
          cursor_column: null,
          cursor_kind: null,
          last_value: null,
          last_count: t.approx_rows,
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
  }

  const briefing = clip(
    [
      prev.summary
        ? `## Resumen acumulado del agente (NO vuelvas a extraer este histórico)\n${prev.summary}`
        : '## Resumen acumulado\n(primera pasada: aún no hay memoria)',
      prev.last_delta_at ? `Última ingestión: ${prev.last_delta_at}` : 'No había ingestión previa.',
      '## Datos NUEVOS desde la última pasada',
      'Trabaja solo con esto + el resumen. No hagas SELECT * de tablas enteras.',
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

  return { briefing, nextMemory }
}
