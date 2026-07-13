import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireColdCallAPI } from '@/lib/auth'
import { resolveCrmUserFkId } from '@/lib/crm-users'
import { createCampaign, listCampaigns } from '@/lib/coldcall/campaigns'
import { resolveColdCallScope } from '@/lib/coldcall/scope'
import { parseColdCallFilterParam } from '@/lib/coldcall/api-query'

const createSchema = z.object({
  name: z.string().min(1, 'Nombre obligatorio'),
  description: z.string().optional(),
  assigned_to_user_id: z.number().int().optional().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const filter = parseColdCallFilterParam(req.query.userId, user.id)
    const scope = await resolveColdCallScope(user, filter)

    if (req.method === 'GET') {
      const campaigns = await listCampaigns(scope)
      return res.status(200).json({ campaigns })
    }

    if (req.method === 'POST') {
      const data = createSchema.parse(req.body)
      const createdById = await resolveCrmUserFkId(user.id)
      const assignedId =
        user.role === 'comercial'
          ? createdById
          : await resolveCrmUserFkId(data.assigned_to_user_id)
      const campaign = await createCampaign({
        name: data.name,
        description: data.description,
        assigned_to_user_id: assignedId,
        created_by_user_id: createdById,
      })
      return res.status(201).json(campaign)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[coldcall/campaigns]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
