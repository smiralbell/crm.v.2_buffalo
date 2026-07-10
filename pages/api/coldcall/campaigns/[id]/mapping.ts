import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import type { ColumnMapping } from '@/lib/coldcall/field-mapping'
import { validateMapping } from '@/lib/coldcall/field-mapping'
import {
  applyCampaignMappingToLeads,
  getCampaignById,
  saveCampaignMapping,
} from '@/lib/coldcall/campaigns'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!requireColdCallAPI(req, res)) return

    const id = parseInt(String(req.query.id), 10)
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' })

    const campaign = await getCampaignById(id)
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' })

    if (req.method === 'GET') {
      return res.status(200).json({
        import_columns: campaign.import_columns || [],
        column_mapping: campaign.column_mapping || {},
      })
    }

    if (req.method === 'PUT') {
      const { import_columns, column_mapping } = req.body as {
        import_columns?: string[]
        column_mapping?: ColumnMapping
      }

      if (!import_columns?.length) {
        return res.status(400).json({ error: 'Faltan columnas del CSV' })
      }

      const err = validateMapping(column_mapping || {})
      if (err) return res.status(400).json({ error: err })

      await saveCampaignMapping(id, import_columns, column_mapping || {})
      const updated = await applyCampaignMappingToLeads(id)

      return res.status(200).json({ ok: true, leads_updated: updated })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[coldcall/campaigns/[id]/mapping]', error)
    const msg = error instanceof Error ? error.message : 'Error al guardar mapeo'
    return res.status(500).json({ error: msg })
  }
}
