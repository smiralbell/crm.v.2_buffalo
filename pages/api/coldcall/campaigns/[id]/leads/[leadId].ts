import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { getCampaignById, getCampaignLeadById } from '@/lib/coldcall/campaigns'
import { parseCampaignId, requireCampaignAccess } from '@/lib/coldcall/api-access'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const campaignId = parseCampaignId(req)
    const leadId = parseInt(String(req.query.leadId), 10)
    if (campaignId == null || !Number.isFinite(leadId)) {
      return res.status(400).json({ error: 'ID inválido' })
    }
    if (!(await requireCampaignAccess(req, res, user, campaignId))) return

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método no permitido' })
    }

    const campaign = await getCampaignById(campaignId)
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' })

    const lead = await getCampaignLeadById(campaignId, leadId)
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    return res.json({
      campaign,
      lead: {
        ...lead,
        created_at: lead.created_at instanceof Date ? lead.created_at.toISOString() : lead.created_at,
        calls: lead.calls.map((c) => ({
          ...c,
          fecha: c.fecha instanceof Date ? c.fecha.toISOString() : c.fecha,
        })),
        activities: lead.activities.map((a) => ({
          ...a,
          created_at: a.created_at instanceof Date ? a.created_at.toISOString() : a.created_at,
        })),
      },
      import_columns: campaign.import_columns || [],
    })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[coldcall/campaigns/[id]/leads/[leadId]]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
