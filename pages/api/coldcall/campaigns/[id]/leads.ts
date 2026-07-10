import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { getCampaignById, listCampaignLeads } from '@/lib/coldcall/campaigns'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireColdCallAPI(req, res)) return

  const id = parseInt(String(req.query.id), 10)
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const campaign = await getCampaignById(id)
  if (!campaign) {
    return res.status(404).json({ error: 'Campaña no encontrada' })
  }

  const { page = '1', limit = '50', q } = req.query as Record<string, string>
  const { leads, total } = await listCampaignLeads(id, {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    q,
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
  })
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
