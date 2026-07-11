import type { NextApiRequest, NextApiResponse } from 'next'
import type { AuthUser } from '@/lib/auth'
import { assertCampaignAccess, getColdCallScope, type ColdCallScope } from '@/lib/coldcall/scope'

export function parseCampaignId(req: NextApiRequest): number | null {
  const id = parseInt(String(req.query.id), 10)
  return Number.isFinite(id) ? id : null
}

export async function requireCampaignAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  user: AuthUser,
  campaignId: number
): Promise<ColdCallScope | null> {
  const scope = getColdCallScope(user)
  try {
    await assertCampaignAccess(scope, campaignId)
    return scope
  } catch {
    res.status(403).json({ error: 'Acceso denegado' })
    return null
  }
}
