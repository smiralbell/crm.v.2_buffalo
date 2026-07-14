import { prisma } from '@/lib/prisma'
import type { ColdCallScope } from './scope'
import { getScopeFilterParams } from './scope'

export interface ColdCallCallbackRow {
  id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  campaign_id: number | null
  campaign_name: string | null
  at: string
  notas: string | null
}

/**
 * Callbacks: "llámame el lunes a las 10" — NO son reuniones de Cal.com.
 * Última llamada con resultado llamar_tarde y fecha de devolución.
 */
export async function listColdCallCallbacks(
  scope: ColdCallScope,
  options?: { daysAhead?: number; daysBack?: number }
): Promise<ColdCallCallbackRow[]> {
  const { userId, teamIds, legacyAdmin } = getScopeFilterParams(scope)
  const daysAhead = options?.daysAhead ?? 30
  const daysBack = options?.daysBack ?? 14

  const rows = await prisma.$queryRaw<
    {
      id: number
      nombre: string
      empresa: string | null
      telefono: string | null
      email: string | null
      campaign_id: number | null
      campaign_name: string | null
      at: Date
      notas: string | null
    }[]
  >`
    SELECT
      p.id,
      p.nombre,
      p.empresa,
      p.telefono,
      p.email,
      camp.id AS campaign_id,
      camp.name AS campaign_name,
      COALESCE(lc.reunion_fecha, p.next_retry_at) AS at,
      lc.notas
    FROM coldcall_prospects p
    LEFT JOIN coldcall_campaigns camp ON camp.id = p.campaign_id
    INNER JOIN LATERAL (
      SELECT resultado, reunion_fecha, notas
      FROM coldcall_calls
      WHERE prospect_id = p.id
      ORDER BY fecha DESC
      LIMIT 1
    ) lc ON TRUE
    WHERE p.deleted_at IS NULL
      AND p.do_not_call = FALSE
      AND lc.resultado = 'llamar_tarde'
      AND COALESCE(lc.reunion_fecha, p.next_retry_at) IS NOT NULL
      AND COALESCE(lc.reunion_fecha, p.next_retry_at) >= NOW() - (${daysBack}::int || ' days')::interval
      AND COALESCE(lc.reunion_fecha, p.next_retry_at) <= NOW() + (${daysAhead}::int || ' days')::interval
      AND p.campaign_id IN (
        SELECT id FROM coldcall_campaigns c
        WHERE (
          (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
          OR (${legacyAdmin} IS NOT TRUE AND ${userId}::int IS NOT NULL AND (c.assigned_to_user_id = ${userId} OR c.created_by_user_id = ${userId}))
          OR (${legacyAdmin} IS NOT TRUE AND ${userId}::int IS NULL AND (
            c.assigned_to_user_id = ANY(${teamIds}::int[])
            OR c.created_by_user_id = ANY(${teamIds}::int[])
            OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
          ))
        )
      )
    ORDER BY at ASC
    LIMIT 100
  `

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    empresa: r.empresa,
    telefono: r.telefono,
    email: r.email,
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
    notas: r.notas,
  }))
}
