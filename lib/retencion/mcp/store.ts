import { getPool } from '@/lib/db'
import { decryptDbUrl, encryptDbUrl } from '../db-url-crypto'
import type { McpConnection, McpTransport } from './client'
import type { McpToolInfo } from './readonly'

/**
 * MCP de cada proyecto de retención (retencion_mcp_servers). El secreto de acceso
 * va cifrado y nunca sale hacia la pantalla ni hacia el agente de Telegram.
 */

export type McpAuthType = 'none' | 'bearer' | 'header'

export type McpServerRow = {
  id: number
  proyecto_id: string
  nombre: string
  url: string
  transport: McpTransport
  auth_type: McpAuthType
  auth_header: string | null
  auth_secret_enc: string | null
  estado: 'conectado' | 'bloqueado' | 'error'
  detalle: string | null
  server_name: string | null
  tools: McpToolInfo[]
  checked_at: string | null
  created_at: string
}

export type McpServerPublic = Omit<McpServerRow, 'auth_secret_enc'> & {
  tiene_secreto: boolean
  secreto_pista: string | null
}

let ensured: Promise<void> | null = null

function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS retencion_mcp_servers (
          id               SERIAL PRIMARY KEY,
          proyecto_id      UUID NOT NULL,
          nombre           TEXT NOT NULL,
          url              TEXT NOT NULL,
          transport        TEXT NOT NULL DEFAULT 'auto',
          auth_type        TEXT NOT NULL DEFAULT 'none',
          auth_header      TEXT,
          auth_secret_enc  TEXT,
          auth_secret_hint TEXT,
          estado           TEXT NOT NULL DEFAULT 'conectado',
          detalle          TEXT,
          server_name      TEXT,
          tools            JSONB NOT NULL DEFAULT '[]'::jsonb,
          checked_at       TIMESTAMPTZ,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS retencion_mcp_servers_proyecto_idx ON retencion_mcp_servers (proyecto_id);
      `)
      .then(() => undefined)
      .catch((e) => {
        ensured = null
        throw e
      })
  }
  return ensured
}

const COLUMNS = `id, proyecto_id::text AS proyecto_id, nombre, url, transport, auth_type, auth_header,
  auth_secret_enc, auth_secret_hint, estado, detalle, server_name, tools, checked_at, created_at`

type RawRow = McpServerRow & { auth_secret_hint: string | null }

export function toPublic(row: RawRow): McpServerPublic {
  const { auth_secret_enc, auth_secret_hint, ...rest } = row
  return { ...rest, tiene_secreto: Boolean(auth_secret_enc), secreto_pista: auth_secret_hint }
}

function hint(secret: string): string {
  const s = secret.trim()
  return s.length <= 8 ? '••••' : `••••${s.slice(-4)}`
}

export async function listMcpServers(proyectoId?: string): Promise<RawRow[]> {
  await ensureTable()
  const { rows } = proyectoId
    ? await getPool().query<RawRow>(`SELECT ${COLUMNS} FROM retencion_mcp_servers WHERE proyecto_id = $1::uuid ORDER BY id`, [proyectoId])
    : await getPool().query<RawRow>(`SELECT ${COLUMNS} FROM retencion_mcp_servers ORDER BY proyecto_id, id`)
  return rows
}

export async function getMcpServer(id: number, proyectoId?: string): Promise<RawRow | null> {
  await ensureTable()
  const { rows } = await getPool().query<RawRow>(
    `SELECT ${COLUMNS} FROM retencion_mcp_servers WHERE id = $1 ${proyectoId ? 'AND proyecto_id = $2::uuid' : ''}`,
    proyectoId ? [id, proyectoId] : [id]
  )
  return rows[0] || null
}

export type McpServerInput = {
  nombre: string
  url: string
  transport: McpTransport
  auth_type: McpAuthType
  auth_header?: string | null
  /** undefined = no cambiar el guardado; '' = quitarlo. */
  auth_secret?: string
}

/** Cabeceras de acceso a partir de lo guardado (o de lo que se acaba de pegar). */
export function connectionFor(input: {
  url: string
  transport: McpTransport
  auth_type: McpAuthType
  auth_header?: string | null
  secret: string | null
}): McpConnection {
  const headers: Record<string, string> = {}
  if (input.secret) {
    if (input.auth_type === 'bearer') headers.Authorization = `Bearer ${input.secret}`
    if (input.auth_type === 'header' && input.auth_header) headers[input.auth_header] = input.secret
  }
  return { url: input.url, transport: input.transport, headers }
}

export function savedConnection(row: RawRow): McpConnection {
  return connectionFor({ ...row, secret: row.auth_secret_enc ? decryptDbUrl(row.auth_secret_enc) : null })
}

export async function insertMcpServer(
  proyectoId: string,
  input: McpServerInput,
  verified: { serverName: string | null; tools: McpToolInfo[]; transport: McpTransport }
): Promise<RawRow> {
  await ensureTable()
  const secret = (input.auth_secret || '').trim()
  const { rows } = await getPool().query<RawRow>(
    `INSERT INTO retencion_mcp_servers
       (proyecto_id, nombre, url, transport, auth_type, auth_header, auth_secret_enc, auth_secret_hint,
        estado, server_name, tools, checked_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, 'conectado', $9, $10::jsonb, NOW())
     RETURNING ${COLUMNS}`,
    [
      proyectoId,
      input.nombre,
      input.url,
      verified.transport,
      input.auth_type,
      input.auth_type === 'header' ? input.auth_header || null : null,
      secret ? encryptDbUrl(secret) : null,
      secret ? hint(secret) : null,
      verified.serverName,
      JSON.stringify(verified.tools),
    ]
  )
  return rows[0]
}

export async function updateMcpServer(
  id: number,
  input: McpServerInput,
  verified: { serverName: string | null; tools: McpToolInfo[]; transport: McpTransport }
): Promise<RawRow> {
  await ensureTable()
  const params: unknown[] = [
    id,
    input.nombre,
    input.url,
    verified.transport,
    input.auth_type,
    input.auth_type === 'header' ? input.auth_header || null : null,
    verified.serverName,
    JSON.stringify(verified.tools),
  ]
  let secretSql = ''
  if (input.auth_secret !== undefined) {
    const secret = input.auth_secret.trim()
    params.push(secret ? encryptDbUrl(secret) : null, secret ? hint(secret) : null)
    secretSql = ', auth_secret_enc = $9, auth_secret_hint = $10'
  }
  const { rows } = await getPool().query<RawRow>(
    `UPDATE retencion_mcp_servers
        SET nombre = $2, url = $3, transport = $4, auth_type = $5, auth_header = $6,
            server_name = $7, tools = $8::jsonb, estado = 'conectado', detalle = NULL, checked_at = NOW()${secretSql}
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    params
  )
  return rows[0]
}

/** Resultado de una comprobación: conectado (lista al día), bloqueado (ya no es solo lectura) o error. */
export async function setMcpStatus(
  id: number,
  estado: McpServerRow['estado'],
  detalle: string | null,
  tools?: McpToolInfo[]
): Promise<RawRow | null> {
  await ensureTable()
  const { rows } = await getPool().query<RawRow>(
    `UPDATE retencion_mcp_servers
        SET estado = $2, detalle = $3, checked_at = NOW(),
            tools = COALESCE($4::jsonb, tools)
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id, estado, detalle, tools ? JSON.stringify(tools) : null]
  )
  return rows[0] || null
}

export async function deleteMcpServer(id: number, proyectoId: string): Promise<boolean> {
  await ensureTable()
  const res = await getPool().query(`DELETE FROM retencion_mcp_servers WHERE id = $1 AND proyecto_id = $2::uuid`, [id, proyectoId])
  return (res.rowCount || 0) > 0
}
