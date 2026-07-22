import { Client } from 'pg'

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|execute|do|merge|replace|vacuum|reindex|cluster|comment|security|set\s+role|set\s+session|pg_read_file|lo_import|lo_export)\b/i

/** Solo SELECT / WITH … SELECT. Bloquea escrituras y DDL. */
export function assertReadOnlySelect(sql: string): string {
  const cleaned = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
  if (!cleaned) throw new Error('SQL vacío')
  if (cleaned.includes(';') && cleaned.replace(/;+\s*$/, '').includes(';')) {
    throw new Error('Solo se permite una sentencia SQL')
  }
  const body = cleaned.replace(/;+\s*$/, '').trim()
  if (!/^(with|select)\b/i.test(body)) {
    throw new Error('Solo se permiten consultas SELECT (o WITH … SELECT)')
  }
  if (FORBIDDEN.test(body)) {
    throw new Error('Consulta bloqueada: el agente solo puede leer (SELECT)')
  }
  return body
}

export type SelectResult = {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
}

export async function runReadOnlySelect(
  connectionString: string,
  sql: string,
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<SelectResult> {
  const safeSql = assertReadOnlySelect(sql)
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
  const timeoutMs = opts.timeoutMs ?? 15000

  const wrapped = `SELECT * FROM (${safeSql}) AS _buffalo_ro LIMIT ${limit + 1}`

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    statement_timeout: timeoutMs,
    query_timeout: timeoutMs,
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  })

  try {
    await client.connect()
    await client.query(`SET statement_timeout = ${timeoutMs}`)
    await client.query(`SET default_transaction_read_only = on`)
    const res = await client.query(wrapped)
    const truncated = res.rows.length > limit
    const rows = (truncated ? res.rows.slice(0, limit) : res.rows).map((r) => {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(r)) {
        if (v instanceof Date) out[k] = v.toISOString()
        else if (typeof v === 'bigint') out[k] = v.toString()
        else if (Buffer.isBuffer(v)) out[k] = `[buffer ${v.length}b]`
        else out[k] = v
      }
      return out
    })
    return {
      columns: res.fields.map((f) => f.name),
      rows,
      rowCount: rows.length,
      truncated,
    }
  } finally {
    try {
      await client.end()
    } catch {
      // ignore
    }
  }
}

export async function probeConnection(connectionString: string): Promise<{
  ok: boolean
  version?: string
  error?: string
}> {
  try {
    const r = await runReadOnlySelect(connectionString, 'SELECT version() AS version', {
      limit: 1,
      timeoutMs: 10000,
    })
    return { ok: true, version: String(r.rows[0]?.version || '') }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de conexión' }
  }
}

export async function listPublicTables(connectionString: string): Promise<
  { schema: string; table: string; approx_rows: number | null }[]
> {
  const r = await runReadOnlySelect(
    connectionString,
    `
    SELECT
      n.nspname AS schema,
      c.relname AS table,
      CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END AS approx_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY n.nspname, c.relname
    `,
    { limit: 200 }
  )
  return r.rows.map((row) => ({
    schema: String(row.schema),
    table: String(row.table),
    approx_rows: row.approx_rows != null ? Number(row.approx_rows) : null,
  }))
}

export async function describeTable(
  connectionString: string,
  schema: string,
  table: string
): Promise<{ column: string; data_type: string; is_nullable: string }[]> {
  const sch = schema.trim() || 'public'
  const tbl = table.trim()
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(sch) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tbl)) {
    throw new Error('Nombre de schema/tabla inválido')
  }
  const r = await runReadOnlySelect(
    connectionString,
    `
    SELECT column_name AS column, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = '${sch}' AND table_name = '${tbl}'
    ORDER BY ordinal_position
    `,
    { limit: 200 }
  )
  return r.rows.map((row) => ({
    column: String(row.column),
    data_type: String(row.data_type),
    is_nullable: String(row.is_nullable),
  }))
}
