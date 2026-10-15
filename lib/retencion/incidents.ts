import { createHash, timingSafeEqual } from 'crypto'
import type { NextApiRequest } from 'next'
import { query } from '@/lib/db'

export type IncidentStatus = 'open' | 'solved'

export type IncidentRow = {
  id: string
  proyecto_id: string
  error_text: string
  error_hash: string
  payload: unknown
  status: IncidentStatus
  occurrences: number
  last_seen_at: Date
  solved_at: Date | null
  created_at: Date
}

function envSecret(name: string): string | null {
  return process.env[name]?.trim() || null
}

export function incidentsWebhookToken(): string | null {
  return envSecret('RETENCION_INCIDENTS_TOKEN') || envSecret('INGEST_TOKEN') || 'buf-incidents-2026'
}

export function incidentsWebhookUrl(): string {
  const base = (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_BASE_URL ||
    ''
  ).replace(/\/$/, '')
  return `${base || 'https://TU_CRM'}/api/webhooks/incidents`
}

export function incidentsBearerMatches(req: NextApiRequest): boolean {
  const expected = incidentsWebhookToken()
  if (!expected) return false
  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!provided) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

let incidentsEnsured = false
export async function ensureIncidentsTable(): Promise<void> {
  if (incidentsEnsured) return
  await query(`
    CREATE TABLE IF NOT EXISTS retencion_incidents (
      id            BIGSERIAL PRIMARY KEY,
      proyecto_id   UUID NOT NULL,
      error_text    TEXT NOT NULL,
      error_hash    TEXT NOT NULL,
      payload       JSONB,
      status        TEXT NOT NULL DEFAULT 'open',
      occurrences   INT NOT NULL DEFAULT 1,
      last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      solved_at     TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS retencion_incidents_proyecto_created
      ON retencion_incidents (proyecto_id, created_at DESC)
  `)
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS retencion_incidents_open_hash
      ON retencion_incidents (proyecto_id, error_hash)
      WHERE status = 'open'
  `)
  await query(`
    ALTER TABLE retencion_incidents
      ADD COLUMN IF NOT EXISTS last_nagged_at TIMESTAMPTZ
  `)
  incidentsEnsured = true
}

export function normalizeIncidentError(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

export function incidentErrorHash(error: string): string {
  const norm = normalizeIncidentError(error).toLowerCase()
  return createHash('sha256').update(norm).digest('hex').slice(0, 32)
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export function parseIncidentPayload(body: unknown): { error: string; clientId: string } | { error: string; clientId: null } {
  const obj = rec(body)
  const errorRaw = obj.error ?? obj.mensaje ?? obj.message ?? obj.incidencia
  const error = typeof errorRaw === 'string' ? normalizeIncidentError(errorRaw) : ''
  const idRaw = obj.client_id ?? obj.proyecto_id ?? obj.project_id ?? obj.clientId
  const clientId = typeof idRaw === 'string' ? idRaw.trim() : idRaw != null ? String(idRaw).trim() : ''
  return { error, clientId: clientId || null }
}

export function buildIncidentsMarkdown(input: { proyectoId: string; proyectoName: string }): string {
  const url = incidentsWebhookUrl()
  return `# Incidencias Buffalo · ${input.proyectoName}

Enviad los errores de producción a este webhook. Cada envío se cuelga **solo de este proyecto**.

## Endpoint

\`POST ${url}\`

Cabecera:

\`\`\`
Authorization: Bearer <token que os da Buffalo>
Content-Type: application/json
\`\`\`

## JSON

El campo \`client_id\` **tiene que ser este** (id del proyecto en el CRM):

\`${input.proyectoId}\`

\`\`\`json
{
  "error": "Descripción del fallo (stack, mensaje, lo que sea)",
  "client_id": "${input.proyectoId}"
}
\`\`\`

## Notas

- Si llega **el mismo error** otra vez y aún no está marcado como solucionado en el CRM, **no avisamos de nuevo** (solo sumamos ocurrencias).
- Cada **día calendario** que siga abierta (sin solucionar) avisamos otra vez por Gmail y Telegram.
- Cuando lo marquemos como solucionado, el mismo error volverá a avisar.
- Errores **distintos** sí avisan siempre.
`
}

export async function ingestIncident(input: {
  proyectoId: string
  error: string
  payload: unknown
}): Promise<{ incident: IncidentRow; notified: boolean; duplicate: boolean }> {
  await ensureIncidentsTable()
  const error = normalizeIncidentError(input.error)
  if (!error) throw new Error('Falta el campo error')
  const hash = incidentErrorHash(error)

  const open = await query<IncidentRow>(
    `SELECT id::text, proyecto_id::text, error_text, error_hash, payload, status,
            occurrences, last_seen_at, solved_at, created_at
       FROM retencion_incidents
      WHERE proyecto_id = $1::uuid AND error_hash = $2 AND status = 'open'
      LIMIT 1`,
    [input.proyectoId, hash]
  )
  const existing = open.rows[0]
  if (existing) {
    const upd = await query<IncidentRow>(
      `UPDATE retencion_incidents
          SET occurrences = occurrences + 1, last_seen_at = NOW(), payload = $2::jsonb
        WHERE id = $1
      RETURNING id::text, proyecto_id::text, error_text, error_hash, payload, status,
                occurrences, last_seen_at, solved_at, created_at`,
      [existing.id, JSON.stringify(input.payload ?? null)]
    )
    return { incident: upd.rows[0] || existing, notified: false, duplicate: true }
  }

  try {
    const inserted = await query<IncidentRow>(
      `INSERT INTO retencion_incidents (proyecto_id, error_text, error_hash, payload, status)
       VALUES ($1::uuid, $2, $3, $4::jsonb, 'open')
       RETURNING id::text, proyecto_id::text, error_text, error_hash, payload, status,
                 occurrences, last_seen_at, solved_at, created_at`,
      [input.proyectoId, error, hash, JSON.stringify(input.payload ?? null)]
    )
    const incident = inserted.rows[0]
    if (!incident) throw new Error('No se pudo guardar la incidencia')
    return { incident, notified: true, duplicate: false }
  } catch (e) {
    const code = e && typeof e === 'object' ? (e as { code?: string }).code : ''
    if (code !== '23505') throw e
    const again = await query<IncidentRow>(
      `SELECT id::text, proyecto_id::text, error_text, error_hash, payload, status,
              occurrences, last_seen_at, solved_at, created_at
         FROM retencion_incidents
        WHERE proyecto_id = $1::uuid AND error_hash = $2 AND status = 'open'
        LIMIT 1`,
      [input.proyectoId, hash]
    )
    const existing2 = again.rows[0]
    if (!existing2) throw e
    const upd = await query<IncidentRow>(
      `UPDATE retencion_incidents
          SET occurrences = occurrences + 1, last_seen_at = NOW(), payload = $2::jsonb
        WHERE id = $1
      RETURNING id::text, proyecto_id::text, error_text, error_hash, payload, status,
                occurrences, last_seen_at, solved_at, created_at`,
      [existing2.id, JSON.stringify(input.payload ?? null)]
    )
    return { incident: upd.rows[0] || existing2, notified: false, duplicate: true }
  }
}

export async function listIncidents(proyectoId: string): Promise<IncidentRow[]> {
  await ensureIncidentsTable()
  const { rows } = await query<IncidentRow>(
    `SELECT id::text, proyecto_id::text, error_text, error_hash, payload, status,
            occurrences, last_seen_at, solved_at, created_at
       FROM retencion_incidents
      WHERE proyecto_id = $1::uuid
      ORDER BY (status = 'open') DESC, last_seen_at DESC
      LIMIT 200`,
    [proyectoId]
  )
  return rows
}

export async function markIncidentSolved(proyectoId: string, id: string): Promise<IncidentRow | null> {
  await ensureIncidentsTable()
  const { rows } = await query<IncidentRow>(
    `UPDATE retencion_incidents
        SET status = 'solved', solved_at = NOW()
      WHERE id = $1 AND proyecto_id = $2::uuid AND status = 'open'
      RETURNING id::text, proyecto_id::text, error_text, error_hash, payload, status,
                occurrences, last_seen_at, solved_at, created_at`,
    [id, proyectoId]
  )
  return rows[0] ?? null
}

export async function listOpenIncidentsForWatch(proyectoId: string, limit = 20): Promise<IncidentRow[]> {
  await ensureIncidentsTable()
  const { rows } = await query<IncidentRow>(
    `SELECT id::text, proyecto_id::text, error_text, error_hash, payload, status,
            occurrences, last_seen_at, solved_at, created_at
       FROM retencion_incidents
      WHERE proyecto_id = $1::uuid AND status = 'open'
      ORDER BY last_seen_at DESC
      LIMIT $2`,
    [proyectoId, limit]
  )
  return rows
}

/** Incidencias nuevas o actualizadas desde la última pasada del cron. */
export async function listIncidentsSince(
  proyectoId: string,
  sinceIso: string | null,
  limit = 40
): Promise<IncidentRow[]> {
  if (!sinceIso) return listOpenIncidentsForWatch(proyectoId, limit)
  await ensureIncidentsTable()
  const { rows } = await query<IncidentRow>(
    `SELECT id::text, proyecto_id::text, error_text, error_hash, payload, status,
            occurrences, last_seen_at, solved_at, created_at
       FROM retencion_incidents
      WHERE proyecto_id = $1::uuid
        AND (last_seen_at > $2::timestamptz OR created_at > $2::timestamptz)
      ORDER BY last_seen_at DESC
      LIMIT $3`,
    [proyectoId, sinceIso, limit]
  )
  return rows
}
