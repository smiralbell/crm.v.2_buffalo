import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireColdCallAPI } from '@/lib/auth'
import { resolveCrmUserFkId } from '@/lib/crm-users'
import {
  deleteCampaign,
  getCampaignById,
  getNextQueueLead,
  getQueueCount,
  updateCampaignAssignee,
} from '@/lib/coldcall/campaigns'
import { parseCampaignId, requireCampaignAccess } from '@/lib/coldcall/api-access'

const patchSchema = z.object({
  assigned_to_user_id: z.number().int().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const id = parseCampaignId(req)
    if (id == null) return res.status(400).json({ error: 'ID inválido' })
    if (!(await requireCampaignAccess(req, res, user, id))) return

    if (req.method === 'GET') {
      const campaign = await getCampaignById(id)
      if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' })
      const queue_count = await getQueueCount(id)
      const next = await getNextQueueLead(id)
      return res.status(200).json({ campaign, queue_count, next_lead: next })
    }

    if (req.method === 'PATCH') {
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo admin puede reasignar campañas' })
      }
      const data = patchSchema.parse(req.body)
      const assignedId =
        data.assigned_to_user_id == null
          ? null
          : await resolveCrmUserFkId(data.assigned_to_user_id)
      if (data.assigned_to_user_id != null && assignedId == null) {
        return res.status(400).json({ error: 'Usuario no válido' })
      }
      const campaign = await updateCampaignAssignee(id, assignedId)
      if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' })
      return res.status(200).json({ campaign })
    }

    if (req.method === 'DELETE') {
      const campaign = await getCampaignById(id)
      if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' })
      await deleteCampaign(id)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (
      error instanceof Error &&
      ['Forbidden', 'No session', 'Invalid session'].includes(error.message)
    ) {
      return
    }
    console.error('[coldcall/campaigns/[id]]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
