import { query } from '@/lib/db'

export type AuditEntry = {
  actor: string
  action: string
  targetTable?: string | null
  ok?: boolean
  detail?: unknown
}

/** Trunca el detalle para no guardar documentos enteros. */
export function compactDetail(detail: unknown, max = 4000): unknown {
  try {
    const s = JSON.stringify(detail)
    if (s === undefined) return null
    return s.length <= max ? detail : { truncated: true, preview: s.slice(0, max) }
  } catch {
    return { unserializable: true }
  }
}

/** Nunca lanza: la auditoría no debe romper la acción auditada. */
export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_log (actor, action, target_table, ok, detail) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        entry.actor,
        entry.action,
        entry.targetTable ?? null,
        entry.ok ?? true,
        JSON.stringify(compactDetail(entry.detail ?? null)),
      ]
    )
  } catch {
    // tabla aún sin crear o BD caída
  }
}

export type AuditRow = {
  id: string
  actor: string
  action: string
  target_table: string | null
  ok: boolean
  detail: unknown
  created_at: Date
}

export async function listAuditLog(limit = 50): Promise<AuditRow[]> {
  const { rows } = await query<AuditRow>(
    `SELECT id::text, actor, action, target_table, ok, detail, created_at
       FROM audit_log ORDER BY created_at DESC LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)]
  )
  return rows
}
