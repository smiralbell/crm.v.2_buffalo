import { randomBytes } from 'crypto'
import { getPool } from '@/lib/db'
import { decryptDbUrl, encryptDbUrl } from '../db-url-crypto'
import type { McpConnection, McpTransport } from './client'
import type { McpToolInfo } from './readonly'

/**
 * Conectores MCP de cada proyecto de retención (retencion_mcp_servers), como los
 * «custom connectors» de Claude: URL + inicio de sesión OAuth y/o cabeceras fijas.
 * Cabeceras, cliente OAuth y tokens van cifrados y nunca salen hacia la pantalla
 * ni hacia el agente de Telegram.
 */

export type McpAuthMode = 'oauth' | 'none'
/** Cómo se identifica el CRM ante el servidor OAuth (igual que en Claude). */
export type McpOAuthClientMode = 'published' | 'auto' | 'custom'
export type McpEstado = 'pendiente' | 'conectado' | 'bloqueado' | 'error'
export type McpHeader = { name: string; value: string }

export type OAuthClientInfo = { client_id: string; client_secret?: string; [k: string]: unknown }
export type OAuthTokensStored = { access_token: string; token_type: string; refresh_token?: string; expires_in?: number; scope?: string; [k: string]: unknown }

export type McpServerRow = {
  id: number
  proyecto_id: string
  nombre: string
  url: string
  transport: McpTransport
  auth_mode: McpAuthMode
  oauth_client: McpOAuthClientMode
  header_names: string[]
  headers_enc: string | null
  oauth_client_enc: string | null
  oauth_tokens_enc: string | null
  oauth_verifier: string | null
  oauth_state: string | null
  auth_server: string | null
  disabled_tools: string[]
  estado: McpEstado
  detalle: string | null
  server_name: string | null
  tools: McpToolInfo[]
  checked_at: string | null
  created_at: string
  // Formato de la primera versión (token Bearer o cabecera sueltos).
  auth_type: string | null
  auth_header: string | null
  auth_secret_enc: string | null
}

export type McpServerPublic = {
  id: number
  nombre: string
  url: string
  transport: McpTransport
  auth_mode: McpAuthMode
  oauth_client: McpOAuthClientMode
  header_names: string[]
  auth_server: string | null
  sesion_iniciada: boolean
  disabled_tools: string[]
  estado: McpEstado
  detalle: string | null
  server_name: string | null
  tools: McpToolInfo[]
  checked_at: string | null
  created_at: string
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
        ALTER TABLE retencion_mcp_servers
          ADD COLUMN IF NOT EXISTS auth_mode        TEXT NOT NULL DEFAULT 'none',
          ADD COLUMN IF NOT EXISTS oauth_client     TEXT NOT NULL DEFAULT 'published',
          ADD COLUMN IF NOT EXISTS header_names     TEXT[] NOT NULL DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS headers_enc      TEXT,
          ADD COLUMN IF NOT EXISTS oauth_client_enc TEXT,
          ADD COLUMN IF NOT EXISTS oauth_tokens_enc TEXT,
          ADD COLUMN IF NOT EXISTS oauth_verifier   TEXT,
          ADD COLUMN IF NOT EXISTS oauth_state      TEXT,
          ADD COLUMN IF NOT EXISTS auth_server      TEXT,
          ADD COLUMN IF NOT EXISTS disabled_tools   TEXT[] NOT NULL DEFAULT '{}';
        CREATE UNIQUE INDEX IF NOT EXISTS retencion_mcp_servers_state_idx
          ON retencion_mcp_servers (oauth_state) WHERE oauth_state IS NOT NULL;
      `)
      .then(() => undefined)
      .catch((e) => {
        ensured = null
        throw e
      })
  }
  return ensured
}

const COLUMNS = `id, proyecto_id::text AS proyecto_id, nombre, url, transport, auth_mode, oauth_client,
  header_names, headers_enc, oauth_client_enc, oauth_tokens_enc, oauth_verifier, oauth_state, auth_server,
  disabled_tools, estado, detalle, server_name, tools, checked_at, created_at,
  auth_type, auth_header, auth_secret_enc`

function enc(value: unknown): string {
  return encryptDbUrl(JSON.stringify(value))
}

function dec<T>(value: string | null): T | null {
  return value ? (JSON.parse(decryptDbUrl(value)) as T) : null
}

export function toPublic(row: McpServerRow): McpServerPublic {
  return {
    id: row.id,
    nombre: row.nombre,
    url: row.url,
    transport: row.transport,
    auth_mode: row.auth_mode,
    oauth_client: row.oauth_client,
    header_names: headerNames(row),
    auth_server: row.auth_server,
    sesion_iniciada: Boolean(row.oauth_tokens_enc),
    disabled_tools: row.disabled_tools || [],
    estado: row.estado,
    detalle: row.detalle,
    server_name: row.server_name,
    tools: row.tools,
    checked_at: row.checked_at,
    created_at: row.created_at,
  }
}

function headerNames(row: McpServerRow): string[] {
  if (row.header_names?.length) return row.header_names
  if (row.auth_secret_enc && row.auth_type === 'bearer') return ['Authorization']
  if (row.auth_secret_enc && row.auth_type === 'header' && row.auth_header) return [row.auth_header]
  return []
}

/** Cabeceras fijas guardadas (incluidas las de la primera versión). */
export function savedHeaders(row: McpServerRow): McpHeader[] {
  const list = dec<McpHeader[]>(row.headers_enc)
  if (list) return list
  if (row.auth_secret_enc) {
    const secret = decryptDbUrl(row.auth_secret_enc)
    if (row.auth_type === 'bearer') return [{ name: 'Authorization', value: `Bearer ${secret}` }]
    if (row.auth_type === 'header' && row.auth_header) return [{ name: row.auth_header, value: secret }]
  }
  return []
}

export function headersToRecord(list: McpHeader[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of list) if (h.name.trim() && h.value) out[h.name.trim()] = h.value
  return out
}

/** Conexión sin OAuth (el OAuth lo añade client.ts con el proveedor de oauth.ts). */
export function savedConnection(row: McpServerRow): McpConnection {
  return { url: row.url, transport: row.transport, headers: headersToRecord(savedHeaders(row)) }
}

export function getOAuthClient(row: McpServerRow): OAuthClientInfo | null {
  return dec<OAuthClientInfo>(row.oauth_client_enc)
}

export function getOAuthTokens(row: McpServerRow): OAuthTokensStored | null {
  return dec<OAuthTokensStored>(row.oauth_tokens_enc)
}

export async function listMcpServers(proyectoId?: string): Promise<McpServerRow[]> {
  await ensureTable()
  const { rows } = proyectoId
    ? await getPool().query<McpServerRow>(`SELECT ${COLUMNS} FROM retencion_mcp_servers WHERE proyecto_id = $1::uuid ORDER BY id`, [proyectoId])
    : await getPool().query<McpServerRow>(`SELECT ${COLUMNS} FROM retencion_mcp_servers ORDER BY proyecto_id, id`)
  return rows
}

export async function getMcpServer(id: number, proyectoId?: string): Promise<McpServerRow | null> {
  await ensureTable()
  const { rows } = await getPool().query<McpServerRow>(
    `SELECT ${COLUMNS} FROM retencion_mcp_servers WHERE id = $1 ${proyectoId ? 'AND proyecto_id = $2::uuid' : ''}`,
    proyectoId ? [id, proyectoId] : [id]
  )
  return rows[0] || null
}

export async function getMcpServerByState(state: string): Promise<McpServerRow | null> {
  await ensureTable()
  const { rows } = await getPool().query<McpServerRow>(`SELECT ${COLUMNS} FROM retencion_mcp_servers WHERE oauth_state = $1`, [state])
  return rows[0] || null
}

export type McpServerInput = {
  nombre: string
  url: string
  transport: McpTransport
  auth_mode: McpAuthMode
  oauth_client: McpOAuthClientMode
  client_id?: string | null
  client_secret?: string | null
  headers: McpHeader[]
}

export async function insertMcpServer(
  proyectoId: string,
  input: McpServerInput,
  extra: { estado: McpEstado; auth_server?: string | null; verified?: { serverName: string | null; tools: McpToolInfo[]; transport: McpTransport } }
): Promise<McpServerRow> {
  await ensureTable()
  const customClient =
    input.auth_mode === 'oauth' && input.oauth_client === 'custom' && input.client_id
      ? { client_id: input.client_id, ...(input.client_secret ? { client_secret: input.client_secret } : {}) }
      : null
  const headers = input.headers.filter((h) => h.name.trim() && h.value)
  const { rows } = await getPool().query<McpServerRow>(
    `INSERT INTO retencion_mcp_servers
       (proyecto_id, nombre, url, transport, auth_type, auth_mode, oauth_client, header_names, headers_enc,
        oauth_client_enc, auth_server, estado, server_name, tools, checked_at)
     VALUES ($1::uuid, $2, $3, $4, 'none', $5, $6, $7::text[], $8, $9, $10, $11, $12, $13::jsonb, $14)
     RETURNING ${COLUMNS}`,
    [
      proyectoId,
      input.nombre,
      input.url,
      extra.verified?.transport || input.transport,
      input.auth_mode,
      input.oauth_client,
      headers.map((h) => h.name.trim()),
      headers.length ? enc(headers) : null,
      customClient ? enc(customClient) : null,
      extra.auth_server || null,
      extra.estado,
      extra.verified?.serverName || null,
      JSON.stringify(extra.verified?.tools || []),
      extra.verified ? new Date() : null,
    ]
  )
  return rows[0]
}

/** Cambios sueltos de una fila (los valores cifrados se pasan ya en claro). */
export async function patchMcpServer(
  id: number,
  patch: Partial<{
    estado: McpEstado
    detalle: string | null
    tools: McpToolInfo[]
    server_name: string | null
    transport: McpTransport
    auth_server: string | null
    oauth_client_info: OAuthClientInfo | null
    oauth_tokens: OAuthTokensStored | null
    oauth_verifier: string | null
    oauth_state: string | null
    disabled_tools: string[]
    checked: boolean
  }>
): Promise<McpServerRow | null> {
  await ensureTable()
  const sets: string[] = []
  const params: unknown[] = [id]
  const add = (sql: string, value: unknown) => {
    params.push(value)
    sets.push(sql.replace('?', `$${params.length}`))
  }
  if (patch.estado !== undefined) add('estado = ?', patch.estado)
  if (patch.detalle !== undefined) add('detalle = ?', patch.detalle)
  if (patch.tools !== undefined) add('tools = ?::jsonb', JSON.stringify(patch.tools))
  if (patch.server_name !== undefined) add('server_name = ?', patch.server_name)
  if (patch.transport !== undefined) add('transport = ?', patch.transport)
  if (patch.auth_server !== undefined) add('auth_server = ?', patch.auth_server)
  if (patch.oauth_client_info !== undefined) add('oauth_client_enc = ?', patch.oauth_client_info ? enc(patch.oauth_client_info) : null)
  if (patch.oauth_tokens !== undefined) add('oauth_tokens_enc = ?', patch.oauth_tokens ? enc(patch.oauth_tokens) : null)
  if (patch.oauth_verifier !== undefined) add('oauth_verifier = ?', patch.oauth_verifier)
  if (patch.oauth_state !== undefined) add('oauth_state = ?', patch.oauth_state)
  if (patch.disabled_tools !== undefined) add('disabled_tools = ?::text[]', patch.disabled_tools)
  if (patch.checked) sets.push('checked_at = NOW()')
  if (!sets.length) return getMcpServer(id)
  const { rows } = await getPool().query<McpServerRow>(
    `UPDATE retencion_mcp_servers SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
    params
  )
  return rows[0] || null
}

export function newOAuthState(): string {
  return randomBytes(24).toString('base64url')
}

export async function deleteMcpServer(id: number, proyectoId: string): Promise<boolean> {
  await ensureTable()
  const res = await getPool().query(`DELETE FROM retencion_mcp_servers WHERE id = $1 AND proyecto_id = $2::uuid`, [id, proyectoId])
  return (res.rowCount || 0) > 0
}
