import type { PoolClient } from 'pg'
import { getPool } from '@/lib/db'

/**
 * Acceso completo al Postgres del CRM para el agente de Telegram.
 *  - Lectura: transacción READ ONLY (Postgres impide escribir aunque el SQL lo intente).
 *  - Escritura: INSERT / UPDATE / SQL no destructivo, con tope de filas.
 *  - Borrado: aquí NUNCA se ejecuta. Solo se prepara un preview; el borrado real lo
 *    hace confirm.ts cuando un socio pulsa los dos botones de confirmación.
 */

const STATEMENT_TIMEOUT_MS = 25_000

/** Cualquier cosa que elimine datos o estructura va por doble confirmación. */
const DESTRUCTIVE =
  /\b(delete|drop|truncate|revoke|grant|reassign|vacuum)\b|\balter\s+[\s\S]*\b(drop|rename)\b/i

export function isDestructiveSql(sql: string): boolean {
  return DESTRUCTIVE.test(stripComments(sql))
}

function stripComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
    .replace(/;+\s*$/, '')
}

export function assertIdent(name: unknown, label = 'identificador'): string {
  const n = String(name ?? '').trim()
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n)) throw new Error(`${label} inválido: ${String(name)}`)
  return n
}

function q(name: string): string {
  return `"${assertIdent(name)}"`
}

function tableRef(table: unknown, schema?: unknown): string {
  return `${q(assertIdent(schema || 'public', 'schema'))}.${q(assertIdent(table, 'tabla'))}`
}

export function serializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(r)) {
      const v = r[k]
      if (v instanceof Date) out[k] = v.toISOString()
      else if (typeof v === 'bigint') out[k] = v.toString()
      else if (Buffer.isBuffer(v)) out[k] = `[binario ${v.length} bytes]`
      else if (typeof v === 'string' && v.length > 1500) out[k] = `${v.slice(0, 1500)}… [${v.length} caracteres]`
      else out[k] = v
    }
    return out
  })
}

async function withTx<T>(readOnly: boolean, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN')
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
    const out = await fn(client)
    await client.query(readOnly ? 'ROLLBACK' : 'COMMIT')
    return out
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/** WHERE a partir de id o de un fragmento parametrizado ($1, $2…). */
function buildWhere(args: Record<string, unknown>, offset = 0): { where: string; params: unknown[] } {
  if (args.id != null && args.id !== '') {
    const col = assertIdent(args.id_columna || 'id', 'id_columna')
    return { where: `${q(col)} = $${offset + 1}`, params: [args.id] }
  }
  const raw = String(args.where_sql || '').trim()
  if (!raw) throw new Error('Indica id o where_sql (nunca se toca una tabla entera sin filtro)')
  if (/;/.test(raw)) throw new Error('where_sql no puede contener ";"')
  const where = raw.replace(/\$(\d+)/g, (_, n) => `$${offset + Number(n)}`)
  const params = Array.isArray(args.where_params) ? args.where_params : []
  return { where, params }
}

export async function listTables(filter?: string) {
  const r = await getPool().query(
    `SELECT c.relname AS tabla,
            CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END AS filas_aprox
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r','p') AND n.nspname = 'public'
       AND ($1::text IS NULL OR c.relname ILIKE '%' || $1 || '%')
     ORDER BY c.relname`,
    [filter?.trim() || null]
  )
  return { ok: true, tablas: serializeRows(r.rows) }
}

export async function describeTable(table: string) {
  const t = assertIdent(table, 'tabla')
  const [cols, fks] = await Promise.all([
    getPool().query(
      `SELECT column_name AS columna, data_type AS tipo, is_nullable AS nullable, column_default AS defecto
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [t]
    ),
    getPool().query(
      `SELECT kcu.column_name AS columna, ccu.table_name AS referencia_tabla, ccu.column_name AS referencia_columna
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1`,
      [t]
    ),
  ])
  if (!cols.rows.length) return { ok: false, error: `La tabla ${t} no existe` }
  return { ok: true, tabla: t, columnas: cols.rows, claves_foraneas: fks.rows }
}

export async function readQuery(sql: string, limit = 100) {
  const cleaned = stripComments(sql)
  if (!/^(with|select)\b/i.test(cleaned)) {
    return { ok: false, error: 'db_consultar solo admite SELECT / WITH. Para cambiar datos usa db_insertar, db_actualizar o db_ejecutar_sql.' }
  }
  const lim = Math.min(Math.max(Math.floor(limit) || 100, 1), 500)
  return withTx(true, async (c) => {
    const r = await c.query(`SELECT * FROM (${cleaned}) AS _tg_q LIMIT ${lim}`)
    return {
      ok: true,
      filas: r.rowCount,
      columnas: r.fields.map((f) => f.name),
      datos: serializeRows(r.rows),
      ...(r.rowCount === lim ? { aviso: `Tope de ${lim} filas alcanzado` } : {}),
    }
  })
}

export async function insertRow(args: Record<string, unknown>) {
  const data = (args.datos || {}) as Record<string, unknown>
  const keys = Object.keys(data)
  if (!keys.length) return { ok: false, error: 'datos vacío' }
  const cols = keys.map((k) => q(assertIdent(k, 'columna'))).join(', ')
  const ph = keys.map((_, i) => `$${i + 1}`).join(', ')
  const values = keys.map((k) => normalizeValue(data[k]))
  return withTx(false, async (c) => {
    const r = await c.query(`INSERT INTO ${tableRef(args.tabla)} (${cols}) VALUES (${ph}) RETURNING *`, values)
    return { ok: true, insertado: serializeRows(r.rows)[0] }
  })
}

export async function updateRows(args: Record<string, unknown>) {
  const data = (args.datos || {}) as Record<string, unknown>
  const keys = Object.keys(data)
  if (!keys.length) return { ok: false, error: 'datos vacío' }
  const set = keys.map((k, i) => `${q(assertIdent(k, 'columna'))} = $${i + 1}`).join(', ')
  const values = keys.map((k) => normalizeValue(data[k]))
  const { where, params } = buildWhere(args, keys.length)
  const max = Math.min(Math.max(Number(args.max_filas) || 25, 1), 1000)
  const table = tableRef(args.tabla)
  return withTx(false, async (c) => {
    const r = await c.query(`UPDATE ${table} SET ${set} WHERE ${where} RETURNING *`, [...values, ...params])
    if ((r.rowCount || 0) > max) {
      throw new Error(`Cancelado: afectaría ${r.rowCount} filas (tope ${max}). Acota el filtro o sube max_filas.`)
    }
    return { ok: true, actualizadas: r.rowCount, filas: serializeRows(r.rows).slice(0, 20) }
  })
}

export async function executeWriteSql(sql: string, params: unknown[] = [], maxRows = 50) {
  const cleaned = stripComments(sql)
  if (isDestructiveSql(cleaned)) {
    return {
      ok: false,
      error: 'Este SQL borra datos o estructura: usa solicitar_borrado o solicitar_sql_destructivo (doble confirmación por botones).',
    }
  }
  if (/^(select|with)\b/i.test(cleaned) && !/\b(insert|update)\b/i.test(cleaned)) {
    return { ok: false, error: 'Para leer usa db_consultar.' }
  }
  return withTx(false, async (c) => {
    const r = await c.query(cleaned, params.map(normalizeValue))
    const max = Math.min(Math.max(Math.floor(maxRows) || 50, 1), 5000)
    if ((r.rowCount || 0) > max) {
      throw new Error(`Cancelado: afectaría ${r.rowCount} filas (tope ${max}). Acota el SQL o sube max_filas.`)
    }
    return { ok: true, filas_afectadas: r.rowCount, datos: serializeRows(r.rows || []).slice(0, 30) }
  })
}

function normalizeValue(v: unknown): unknown {
  // Objetos → JSON (columnas jsonb). Los arrays los convierte pg a array de Postgres.
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) return JSON.stringify(v)
  return v
}

// ——— Borrados: preparar (aquí) y ejecutar (solo desde confirm.ts) ———

export type DeleteRowsPayload = {
  table: string
  where: string
  params: unknown[]
  expected: number
}

export async function previewDelete(args: Record<string, unknown>): Promise<
  | { ok: false; error: string }
  | { ok: true; payload: DeleteRowsPayload; count: number; sample: Record<string, unknown>[] }
> {
  const table = assertIdent(args.tabla, 'tabla')
  const { where, params } = buildWhere(args)
  return withTx(true, async (c) => {
    const count = await c.query(`SELECT COUNT(*)::int AS n FROM ${tableRef(table)} WHERE ${where}`, params)
    const n = Number(count.rows[0]?.n || 0)
    if (!n) return { ok: false as const, error: 'No hay ninguna fila que coincida: no hay nada que borrar.' }
    const max = Math.min(Math.max(Number(args.max_filas) || 50, 1), 5000)
    if (n > max) {
      return {
        ok: false as const,
        error: `El filtro coincide con ${n} filas (tope ${max}). Acota el filtro o pide max_filas mayor si de verdad quieres borrarlas todas.`,
      }
    }
    const sample = await c.query(`SELECT * FROM ${tableRef(table)} WHERE ${where} LIMIT 5`, params)
    return {
      ok: true as const,
      payload: { table, where, params, expected: n },
      count: n,
      sample: serializeRows(sample.rows),
    }
  })
}

/** Ejecuta un borrado ya confirmado dos veces. Aborta si ahora coinciden más filas que en el preview. */
export async function executeDeleteRows(p: DeleteRowsPayload) {
  return withTx(false, async (c) => {
    const r = await c.query(`DELETE FROM ${tableRef(p.table)} WHERE ${p.where} RETURNING *`, p.params)
    if ((r.rowCount || 0) > p.expected) {
      throw new Error(
        `Abortado: ahora coinciden ${r.rowCount} filas y el preview mostraba ${p.expected}. No se ha borrado nada.`
      )
    }
    return { ok: true, borradas: r.rowCount, filas: serializeRows(r.rows).slice(0, 5) }
  })
}

export async function executeDestructiveSql(sql: string, params: unknown[]) {
  return withTx(false, async (c) => {
    const r = await c.query(sql, params)
    return { ok: true, filas_afectadas: r.rowCount, datos: serializeRows(r.rows || []).slice(0, 10) }
  })
}
