/**
 * Cliente Postgres del MCP Buffalo CRM.
 * Usa DATABASE_URL del .env del proyecto (mismo que el CRM).
 */
import { Client, type QueryResult } from 'pg'
import path from 'path'
import fs from 'fs'
import { config as dotenvConfig } from 'dotenv'

export function loadEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../.env'),
  ]
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue
    dotenvConfig({ path: p, override: false })
    return
  }
}

function connectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL no está configurada (necesita el .env del CRM)')
  return url
}

export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const cs = connectionString()
  const client = new Client({
    connectionString: cs,
    ssl: cs.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end().catch(() => {})
  }
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[]; rowCount: number; fields: string[] }> {
  return withClient(async (client) => {
    const res: QueryResult = await client.query(sql, params)
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? res.rows.length,
      fields: res.fields?.map((f) => f.name) ?? [],
    }
  })
}

export function serializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      if (v instanceof Date) out[k] = v.toISOString()
      else if (typeof v === 'bigint') out[k] = v.toString()
      else if (Buffer.isBuffer(v)) out[k] = `[buffer ${v.length}b]`
      else out[k] = v
    }
    return out
  })
}

/** Identificador SQL seguro (tabla/columna/schema). */
export function assertIdent(name: string, label = 'identificador'): string {
  const n = String(name || '').trim()
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n)) {
    throw new Error(`${label} inválido: ${name}`)
  }
  return n
}

export function quoteIdent(name: string): string {
  return `"${assertIdent(name).replace(/"/g, '')}"`
}
