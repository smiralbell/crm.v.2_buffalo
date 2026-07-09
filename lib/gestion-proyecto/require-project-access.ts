import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI, type AuthUser } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'

export async function requireProjectAccessAPI(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string
): Promise<AuthUser> {
  const user = await requireAuthAPI(req, res)
  await assertProjectAccess(user, projectId, res)
  return user
}
