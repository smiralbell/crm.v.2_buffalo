import type { AuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export type ColdCallScope = { mode: 'all' } | { mode: 'user'; userId: number }

export function getColdCallScope(user: AuthUser): ColdCallScope {
  if (user.role === 'comercial') return { mode: 'user', userId: user.id }
  return { mode: 'all' }
}

export function scopeOwnerUserId(scope: ColdCallScope): number | null {
  return scope.mode === 'user' ? scope.userId : null
}

export async function assertCampaignAccess(
  scope: ColdCallScope,
  campaignId: number
): Promise<void> {
  if (scope.mode === 'all') return
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
  if (scope.mode === 'all') return
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
