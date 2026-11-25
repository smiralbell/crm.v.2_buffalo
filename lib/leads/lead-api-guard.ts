import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI, type AuthUser } from '@/lib/auth'

const SESSION_ERRORS = ['No session', 'Invalid session', 'Expired session', 'Forbidden']

/** Usuario con acceso a la ficha de lead (admin o project manager) y el id del lead. */
export async function requireLeadPage(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<{ user: AuthUser; leadId: number } | null> {
  const user = await requireAuthAPI(req, res)
  if (user.role !== 'admin' && user.role !== 'project_manager') {
    res.status(403).json({ error: 'Sin acceso a leads' })
    return null
  }
  const leadId = parseInt(String(req.query.id), 10)
  if (!Number.isFinite(leadId) || leadId <= 0) {
    res.status(400).json({ error: 'id de lead inválido' })
    return null
  }
  return { user, leadId }
}

export function isSessionError(error: unknown): boolean {
  return error instanceof Error && SESSION_ERRORS.includes(error.message)
}
