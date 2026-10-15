import { lookup } from 'node:dns/promises'
import { Client } from 'pg'
import { maskDbUrl } from '@/lib/retencion/db-url-crypto'

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|execute|do|merge|replace|vacuum|reindex|cluster|comment|security|set\s+role|set\s+session|pg_read_file|lo_import|lo_export)\b/i

type SslOption = boolean | { rejectUnauthorized: false } | undefined

/** Quita usuario/clave de errores de pg (a menudo incluyen la URL). */
export function redactDbError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg
    .replace(/postgres(ql)?:\/\/[^@\s/]+@/gi, 'postgres://***@')
    .replace(/(password|pwd)=([^&\s]+)/gi, '$1=***')
}

export type ParsedPgUrl = {
  host: string
  port: number
  user: string
  password: string
  database: string
  sslmode: 'disable' | 'require' | 'prefer'
}

/** EasyPanel copia la URL con comillas, espacios o sslmode=disable. */
export function normalizePgUrl(raw: string): string {
  return raw.trim().replace(/^['"`]+|['"`]+$/g, '')
}

export function parsePgUrl(raw: string): ParsedPgUrl {
  const s = normalizePgUrl(raw)
  if (!/^postgres(ql)?:\/\//i.test(s)) {
    throw new Error('La URL debe ser postgres:// o postgresql://')
  }
  let u: URL
  try {
    u = new URL(s.replace(/^postgres(ql)?:/i, 'http:'))
  } catch {
    throw new Error('URL de PostgreSQL inválida. En EasyPanel copia la URL de conexión externa tal cual.')
  }
  const sslRaw = (u.searchParams.get('sslmode') || '').toLowerCase()
  const sslmode: ParsedPgUrl['sslmode'] =
    sslRaw === 'require' || sslRaw.startsWith('verify') ? 'require' : sslRaw === 'prefer' ? 'prefer' : 'disable'
  const database = decodeURIComponent((u.pathname || '/').replace(/^\//, '').split('/')[0] || '').split('?')[0]
  return {
    host: decodeURIComponent(u.hostname || ''),
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    database: database || 'postgres',
    sslmode,
  }
}

function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
}

/** EasyPanel: URL externa = IP del servidor + puerto publicado, TLS desactivado. */
export function pgSslConfig(connectionString: string): SslOption {
  const parsed = parsePgUrl(connectionString)
  if (parsed.sslmode === 'require') return { rejectUnauthorized: false }
  return undefined
}

function sslAttempts(parsed: ParsedPgUrl): Array<false | { rejectUnauthorized: false; servername: string }> {
  if (parsed.sslmode === 'require') {
    return [{ rejectUnauthorized: false, servername: parsed.host }]
  }
  // sslmode=disable (EasyPanel) o sin param: primero sin TLS.
  if (parsed.sslmode === 'disable') return [false]
  return [false, { rejectUnauthorized: false, servername: parsed.host }]
}

async function resolveIpv4(host: string): Promise<string> {
  if (isIpv4(host) || host === 'localhost' || host === '127.0.0.1') return host
  try {
    const rec = await lookup(host, { family: 4 })
    return rec.address || host
  } catch {
    return host
  }
}

/**
 * EasyPanel pone panel.dominio como Host externo. Eso es válido.
 * Desde fuera del VPS entra por la IP; desde un contenedor en el mismo VPS
 * hay que entrar por el gateway de Docker. Se prueban a la vez.
 */
export function connectHostCandidates(hostname: string, resolved: string): string[] {
  const hosts: string[] = []
  const add = (h: string) => {
    if (h && hosts.indexOf(h) === -1) hosts.push(h)
  }
  add(resolved)
  add(hostname)
  add('172.17.0.1')
  add('172.18.0.1')
  add('host.docker.internal')
  return hosts
}

function tryOpenOnHost(
  host: string,
  parsed: ParsedPgUrl,
  ssl: false | { rejectUnauthorized: false; servername: string },
  timeoutMs: number
): Promise<Client> {
  const client = new Client({
    host,
    port: parsed.port,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
    ssl,
    connectionTimeoutMillis: timeoutMs,
  })
  return client.connect().then(
    () => client,
    (err: unknown) => {
      client.end().catch(() => undefined)
      return Promise.reject(err)
    }
  )
}

/** Primera conexión que responda; el resto se cierra. */
function firstOpenClient(
  hosts: string[],
  parsed: ParsedPgUrl,
  ssl: false | { rejectUnauthorized: false; servername: string },
  timeoutMs: number
): Promise<Client> {
  return new Promise((resolve, reject) => {
    let remaining = hosts.length
    let done = false
    let last: unknown
    if (!remaining) {
      reject(new Error('No se pudo conectar'))
      return
    }
    for (let i = 0; i < hosts.length; i++) {
      tryOpenOnHost(hosts[i], parsed, ssl, timeoutMs).then(
        (client) => {
          if (done) {
            client.end().catch(() => undefined)
            return
          }
          done = true
          resolve(client)
        },
        (err) => {
          last = err
          remaining -= 1
          if (!done && remaining === 0) {
            reject(last instanceof Error ? last : new Error('No se pudo conectar'))
          }
        }
      )
    }
  })
}

async function openPgClient(
  parsed: ParsedPgUrl,
  ssl: false | { rejectUnauthorized: false; servername: string },
  timeoutMs: number
): Promise<Client> {
  const resolved = await resolveIpv4(parsed.host)
  const hosts = connectHostCandidates(parsed.host, resolved)
  const perHost = Math.min(Math.max(timeoutMs, 4000), 10000)
  return firstOpenClient(hosts, parsed, ssl, perHost)
}

export function explainPgConnectError(e: unknown, connectionString?: string): string {
  const raw = redactDbError(e)
  const msg = raw.toLowerCase()
  const masked = connectionString ? maskDbUrl(connectionString) : { host: null, database: null }
  const where = masked.host ? ` ${masked.host}` : ''
  if (
    msg.includes('timeout expired') ||
    msg.includes('etimedout') ||
    msg.includes('timed out') ||
    msg.includes('connect timeout') ||
    msg.includes('connection terminated')
  ) {
    return `No responde${where}. Esa es la URL externa de EasyPanel (Host externo + Puerto externo): déjala tal cual. El CRM reintenta por IP y por la red del servidor; si sigue el timeout, recarga y vuelve a conectar.`
  }
  if (msg.includes('enotfound') || msg.includes('getaddrinfo') || msg.includes('eai_again')) {
    return `No se resuelve el host${where}. Revisa el nombre en la URL.`
  }
  if (msg.includes('password') || msg.includes('authentication failed') || msg.includes('28p01')) {
    return 'Usuario o contraseña incorrectos.'
  }
  return raw
}

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

async function withReadOnlyClient<T>(
  connectionString: string,
  timeoutMs: number,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const parsed = parsePgUrl(connectionString)
  const attempts = sslAttempts(parsed)
  const connectMs = Math.min(Math.max(timeoutMs, 4000), 15000)
  let last: unknown
  for (let i = 0; i < attempts.length; i++) {
    let client: Client | null = null
    try {
      client = await openPgClient(parsed, attempts[i], connectMs)
      try {
        await client.query(`SET statement_timeout = ${timeoutMs}`)
      } catch {
        /* algunos hosts no permiten SET */
      }
      try {
        await client.query(`SET default_transaction_read_only = on`)
      } catch {
        /* ignore */
      }
      const out = await fn(client)
      try {
        await client.end()
      } catch {
        /* ignore */
      }
      return out
    } catch (e) {
      last = e
      if (client) {
        try {
          await client.end()
        } catch {
          /* ignore */
        }
      }
    }
  }
  throw new Error(explainPgConnectError(last, connectionString) || 'No se pudo conectar al PostgreSQL')
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

  return withReadOnlyClient(connectionString, timeoutMs, async (client) => {
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
  })
}

export async function probeConnection(connectionString: string): Promise<{
  ok: boolean
  version?: string
  error?: string
}> {
  let parsed: ParsedPgUrl
  try {
    parsed = parsePgUrl(connectionString)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'URL inválida' }
  }
  const attempts = sslAttempts(parsed)
  let last: unknown
  for (let i = 0; i < attempts.length; i++) {
    let client: Client | null = null
    try {
      client = await openPgClient(parsed, attempts[i], 10000)
      await client.query('SELECT 1 AS ok')
      try {
        await client.end()
      } catch {
        /* ignore */
      }
      return { ok: true }
    } catch (e) {
      last = e
      if (client) {
        try {
          await client.end()
        } catch {
          /* ignore */
        }
      }
    }
  }
  return { ok: false, error: explainPgConnectError(last, connectionString) }
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
