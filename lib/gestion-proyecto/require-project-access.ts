import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI, type AuthUser } from '@/lib/auth'
import { assertLeadAccess, assertProjectAccess } from '@/lib/project-access'

export async function requireProjectAccessAPI(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string
): Promise<AuthUser> {
  const user = await requireAuthAPI(req, res)
  await assertProjectAccess(user, projectId, res)
  return user
}

/** Para rutas de onboarding (por leadId): admin todo, resto solo leads de proyectos asignados. */
export async function requireLeadAccessAPI(
  req: NextApiRequest,
  res: NextApiResponse,
  leadId: unknown
): Promise<AuthUser> {
  const user = await requireAuthAPI(req, res)
  await assertLeadAccess(user, leadId, res)
  return user
}
