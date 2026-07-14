import { prisma } from '@/lib/prisma'
import {
  parseMeetingDateFromNotas,
} from '@/lib/coldcall/meeting-datetime'
import type { ColdCallScope } from './scope'
import { getScopeFilterParams } from './scope'

export interface ColdCallMeetingRow {
  id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  campaign_id: number | null
  campaign_name: string | null
  at: string
  stage: string
  notas: string | null
}

async function backfillReunionFecha(callId: number, parsed: Date) {
  await prisma.$executeRaw`
    UPDATE coldcall_calls SET reunion_fecha = ${parsed} WHERE id = ${callId} AND reunion_fecha IS NULL
  `
}

/** Solo reuniones reales agendadas vía Cal.com (resultado reunion_agendada). */
export async function listColdCallMeetings(
  scope: ColdCallScope,
  options?: { daysAhead?: number; daysBack?: number }
): Promise<ColdCallMeetingRow[]> {
  const { userId, teamIds, legacyAdmin } = getScopeFilterParams(scope)
  const daysAhead = options?.daysAhead ?? 60
  const daysBack = options?.daysBack ?? 14

  const rows = await prisma.$queryRaw<
    {
      id: number
      call_id: number
      nombre: string
      empresa: string | null
      telefono: string | null
      email: string | null
      campaign_id: number | null
      campaign_name: string | null
      at: Date | null
      stage: string
      notas: string | null
    }[]
  >`
    SELECT
      p.id,
      lc.call_id,
      p.nombre,
      p.empresa,
      p.telefono,
      p.email,
      camp.id AS campaign_id,
      camp.name AS campaign_name,
      lc.reunion_fecha AS at,
      COALESCE(p.stage, 'nuevo') AS stage,
      lc.notas
    FROM coldcall_prospects p
    LEFT JOIN coldcall_campaigns camp ON camp.id = p.campaign_id
    INNER JOIN LATERAL (
      SELECT id AS call_id, reunion_fecha, notas
      FROM coldcall_calls
      WHERE prospect_id = p.id AND resultado = 'reunion_agendada'
      ORDER BY fecha DESC
      LIMIT 1
    ) lc ON TRUE
    WHERE p.deleted_at IS NULL
      AND p.do_not_call = FALSE
      AND (
        lc.reunion_fecha IS NOT NULL
        OR lc.notas ILIKE '%cal.com%'
      )
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
    ORDER BY COALESCE(lc.reunion_fecha, NOW()) ASC
    LIMIT 100
  `

  const now = Date.now()
  const minMs = now - daysBack * 24 * 60 * 60 * 1000
  const maxMs = now + daysAhead * 24 * 60 * 60 * 1000

  const result: ColdCallMeetingRow[] = []

  for (const r of rows) {
    let at: Date | null = r.at instanceof Date ? r.at : r.at ? new Date(r.at) : null

    if (!at || Number.isNaN(at.getTime())) {
      const parsed = parseMeetingDateFromNotas(r.notas)
      if (parsed) {
        at = parsed
        await backfillReunionFecha(r.call_id, parsed)
      }
    }

    if (!at || Number.isNaN(at.getTime())) continue
    if (at.getTime() < minMs || at.getTime() > maxMs) continue

    result.push({
      id: r.id,
      nombre: r.nombre,
      empresa: r.empresa,
      telefono: r.telefono,
      email: r.email,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      at: at.toISOString(),
      stage: r.stage,
      notas: r.notas,
    })
  }

  result.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  return result
}
