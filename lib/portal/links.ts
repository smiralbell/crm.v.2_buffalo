/**
 * Enlaces mágicos del portal del cliente. El token solo se muestra al crearlo;
 * en BD queda su hash, así que una copia de la base de datos no da acceso.
 */
import { createHash, randomBytes } from 'crypto'
import { query } from '@/lib/db'
import { getPublicFormsBaseUrl } from '@/lib/onboarding/public-forms-url'

export type PortalLink = {
  id: string
  created_by: string | null
  created_at: Date
  last_seen_at: Date | null
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function isPlausiblePortalToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,64}$/.test(token)
}

export function portalUrl(token: string): string {
  const base = getPublicFormsBaseUrl().replace(/\/$/, '')
  return `${base}/p/${token}`
}

export async function createPortalLink(projectId: string, createdBy: string): Promise<{ id: string; token: string; url: string }> {
  const token = randomBytes(24).toString('base64url')
  const { rows } = await query<{ id: string }>(
    `INSERT INTO client_portal_links (project_id, token_hash, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [projectId, hashToken(token), createdBy]
  )
  return { id: rows[0].id, token, url: portalUrl(token) }
}

export async function listPortalLinks(projectId: string): Promise<PortalLink[]> {
  const { rows } = await query<PortalLink>(
    `SELECT id, created_by, created_at, last_seen_at FROM client_portal_links
      WHERE project_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
    [projectId]
  )
  return rows
}

export async function revokePortalLink(projectId: string, linkId: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE client_portal_links SET revoked_at = NOW() WHERE id = $1 AND project_id = $2 AND revoked_at IS NULL`,
    [linkId, projectId]
  )
  return rowCount > 0
}

/** Proyecto al que da acceso el token (o null si no existe o está revocado). */
export async function resolvePortalToken(token: string): Promise<{ linkId: string; projectId: string; projectName: string } | null> {
  if (!isPlausiblePortalToken(token)) return null
  const { rows } = await query<{ link_id: string; project_id: string; project_name: string }>(
    `SELECT l.id AS link_id, p.id AS project_id, p.name AS project_name
       FROM client_portal_links l
       JOIN proyectos p ON p.id = l.project_id
      WHERE l.token_hash = $1 AND l.revoked_at IS NULL
      LIMIT 1`,
    [hashToken(token)]
  )
  const row = rows[0]
  if (!row) return null
  void query(`UPDATE client_portal_links SET last_seen_at = NOW() WHERE id = $1`, [row.link_id]).catch(() => undefined)
  return { linkId: row.link_id, projectId: row.project_id, projectName: row.project_name }
}
