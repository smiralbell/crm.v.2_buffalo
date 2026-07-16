import { prisma } from '@/lib/prisma'
import type { ColdCallScope } from '@/lib/coldcall/scope'
import { getScopeFilterParams } from '@/lib/coldcall/scope'
import { normalizePhoneDigits } from '@/lib/coldcall/import-duplicate-check'

export interface PhoneLookupHit {
  id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  campaign_id: number | null
  campaign_name: string | null
  stage: string | null
  call_attempts: number
}

/** Extrae dígitos útiles de lo que pega el comercial (con o sin +34). */
export function extractLookupDigits(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalized = normalizePhoneDigits(trimmed)
  if (normalized) return normalized
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 6) return null
  return digits
}

/**
 * Busca prospectos por teléfono dentro del alcance del comercial/admin.
 * Empareja por dígitos completos o por los últimos 9 (móvil ES sin prefijo).
 */
export async function lookupProspectsByPhone(
  scope: ColdCallScope,
  query: string,
  limit = 15
): Promise<PhoneLookupHit[]> {
  const digits = extractLookupDigits(query)
  if (!digits) return []

  const last9 = digits.length > 9 ? digits.slice(-9) : digits
  const likeDigits = `%${digits}%`
  const likeLast9 = `%${last9}%`
  const { userId, teamIds, legacyAdmin } = getScopeFilterParams(scope)

  const rows = await prisma.$queryRaw<
    {
      id: number
      nombre: string
      empresa: string | null
      telefono: string | null
      email: string | null
      campaign_id: number | null
      campaign_name: string | null
      stage: string | null
      call_attempts: number
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
      p.stage,
      COALESCE(p.call_attempts, 0)::int AS call_attempts
    FROM coldcall_prospects p
    LEFT JOIN coldcall_campaigns camp ON camp.id = p.campaign_id
    WHERE p.deleted_at IS NULL
      AND p.telefono IS NOT NULL
      AND TRIM(p.telefono) <> ''
      AND (
        regexp_replace(COALESCE(p.telefono, ''), '[^0-9]', '', 'g') LIKE ${likeDigits}
        OR regexp_replace(COALESCE(p.telefono, ''), '[^0-9]', '', 'g') LIKE ${likeLast9}
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
    ORDER BY
      CASE
        WHEN regexp_replace(COALESCE(p.telefono, ''), '[^0-9]', '', 'g') = ${digits} THEN 0
        WHEN regexp_replace(COALESCE(p.telefono, ''), '[^0-9]', '', 'g') LIKE ${likeLast9} THEN 1
        ELSE 2
      END,
      p.updated_at DESC NULLS LAST
    LIMIT ${limit}
  `

  return rows
}
