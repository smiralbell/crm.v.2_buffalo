import type { AuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export type ColdCallScope =
  | { mode: 'user'; userId: number }
  | { mode: 'team'; userIds: number[] }

export type ColdCallFilter = number | 'team'

export async function getColdCallTeamUserIds(): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM crm_users
    WHERE active = TRUE AND role IN ('admin', 'comercial')
    ORDER BY id
  `
  return rows.map((r) => r.id)
}

export function getScopeFilterParams(scope: ColdCallScope): {
  userId: number | null
  teamIds: number[]
  legacyAdmin: boolean
} {
  if (scope.mode === 'user') {
    if (scope.userId === 0) {
      return { userId: null, teamIds: [], legacyAdmin: true }
    }
    return { userId: scope.userId, teamIds: [], legacyAdmin: false }
  }
  return { userId: null, teamIds: scope.userIds, legacyAdmin: false }
}

/** Alcance para comercial o admin sin filtro explícito en lecturas. */
export async function getColdCallScope(user: AuthUser): Promise<ColdCallScope> {
  if (user.role === 'comercial') return { mode: 'user', userId: user.id }
  return { mode: 'team', userIds: await getColdCallTeamUserIds() }
}

export async function resolveColdCallScope(
  user: AuthUser,
  filter?: ColdCallFilter | null
): Promise<ColdCallScope> {
  if (user.role === 'comercial') return { mode: 'user', userId: user.id }

  const teamIds = await getColdCallTeamUserIds()

  if (filter === 'team') return { mode: 'team', userIds: teamIds }

  const userId = typeof filter === 'number' ? filter : user.id
  if (userId === 0) return { mode: 'user', userId: 0 }
  if (teamIds.includes(userId)) return { mode: 'user', userId }

  return { mode: 'user', userId: user.id === 0 ? 0 : user.id }
}

export async function assertCampaignAccess(
  scope: ColdCallScope,
  campaignId: number
): Promise<void> {
  if (scope.mode === 'team') {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok FROM coldcall_campaigns c
      WHERE c.id = ${campaignId}
        AND (
          c.assigned_to_user_id = ANY(${scope.userIds}::int[])
          OR c.created_by_user_id = ANY(${scope.userIds}::int[])
          OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
        )
      LIMIT 1
    `
    if (!rows[0]) throw new Error('Forbidden')
    return
  }

  if (scope.userId === 0) {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok FROM coldcall_campaigns c
      WHERE c.id = ${campaignId}
        AND c.assigned_to_user_id IS NULL
        AND c.created_by_user_id IS NULL
      LIMIT 1
    `
    if (!rows[0]) throw new Error('Forbidden')
    return
  }

  const rows = await prisma.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok FROM coldcall_campaigns c
    WHERE c.id = ${campaignId}
      AND (c.assigned_to_user_id = ${scope.userId} OR c.created_by_user_id = ${scope.userId})
    LIMIT 1
  `
  if (!rows[0]) throw new Error('Forbidden')
}

export async function assertProspectAccess(
  scope: ColdCallScope,
  prospectId: number
): Promise<void> {
  if (scope.mode === 'team') {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok
      FROM coldcall_prospects p
      INNER JOIN coldcall_campaigns c ON c.id = p.campaign_id
      WHERE p.id = ${prospectId}
        AND p.deleted_at IS NULL
        AND (
          c.assigned_to_user_id = ANY(${scope.userIds}::int[])
          OR c.created_by_user_id = ANY(${scope.userIds}::int[])
          OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
        )
      LIMIT 1
    `
    if (!rows[0]) throw new Error('Forbidden')
    return
  }

  if (scope.userId === 0) {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok
      FROM coldcall_prospects p
      INNER JOIN coldcall_campaigns c ON c.id = p.campaign_id
      WHERE p.id = ${prospectId}
        AND p.deleted_at IS NULL
        AND c.assigned_to_user_id IS NULL
        AND c.created_by_user_id IS NULL
      LIMIT 1
    `
    if (!rows[0]) throw new Error('Forbidden')
    return
  }

  const rows = await prisma.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok
    FROM coldcall_prospects p
    INNER JOIN coldcall_campaigns c ON c.id = p.campaign_id
    WHERE p.id = ${prospectId}
      AND p.deleted_at IS NULL
      AND (c.assigned_to_user_id = ${scope.userId} OR c.created_by_user_id = ${scope.userId})
    LIMIT 1
  `
  if (!rows[0]) throw new Error('Forbidden')
}
