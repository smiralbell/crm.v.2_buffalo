import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { getCampaignById, listCampaignLeads, type CampaignLeadCallFilter } from '@/lib/coldcall/campaigns'
import { parseCampaignId, requireCampaignAccess } from '@/lib/coldcall/api-access'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const id = parseCampaignId(req)
    if (id == null) return res.status(400).json({ error: 'ID inválido' })
    if (!(await requireCampaignAccess(req, res, user, id))) return

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método no permitido' })
    }

    const campaign = await getCampaignById(id)
    if (!campaign) {
      return res.status(404).json({ error: 'Campaña no encontrada' })
    }

    const { page = '1', limit = '50', q, callFilter } = req.query as Record<string, string>
    const filter: CampaignLeadCallFilter =
      callFilter === 'pending' || callFilter === 'called' ? callFilter : 'all'

    const { leads, total } = await listCampaignLeads(id, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      q,
      callFilter: filter,
    })

    const import_columns =
      campaign.import_columns?.length
        ? campaign.import_columns
        : deriveColumnsFromLeads(leads)

    return res.json({
      campaign,
      leads: leads.map((l) => ({
        id: l.id,
        nombre: l.nombre,
        telefono: l.telefono,
        email: l.email,
        stage: l.stage,
        call_attempts: l.call_attempts,
        call_count: l.call_count ?? 0,
        raw_data: l.raw_data || {},
        created_at: l.created_at instanceof Date ? l.created_at.toISOString() : l.created_at,
      })),
      import_columns,
      column_mapping: campaign.column_mapping || {},
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      callFilter: filter,
    })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[coldcall/campaigns/[id]/leads]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

function deriveColumnsFromLeads(
  leads: { raw_data: Record<string, string> | null }[]
): string[] {
  const keys = new Set<string>()
  for (const l of leads) {
    if (l.raw_data) {
      for (const k of Object.keys(l.raw_data)) keys.add(k)
    }
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b, 'es'))
}
