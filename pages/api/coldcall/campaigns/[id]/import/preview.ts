import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { parseCsvText } from '@/lib/coldcall/apollo-csv'
import { guessColumnMapping, applyColumnMapping, validateMapping, type ColumnMapping } from '@/lib/coldcall/field-mapping'
import { getCampaignById } from '@/lib/coldcall/campaigns'
import { parseCampaignId, requireCampaignAccess } from '@/lib/coldcall/api-access'
import {
  findOtherCampaignMatchesForLeads,
  summarizeOtherCampaignMatches,
} from '@/lib/coldcall/import-duplicate-check'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const id = parseCampaignId(req)
    if (id == null) return res.status(400).json({ error: 'ID inválido' })
    if (!(await requireCampaignAccess(req, res, user, id))) return

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const campaign = await getCampaignById(id)
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' })

    const { csv_text, column_mapping } = req.body as {
      csv_text?: string
      column_mapping?: ColumnMapping
    }
    if (!csv_text?.trim()) return res.status(400).json({ error: 'CSV vacío' })

    const rows = parseCsvText(csv_text)
    if (rows.length === 0) return res.status(400).json({ error: 'No se encontraron filas en el CSV' })

    const headers = Object.keys(rows[0])
    const suggested_mapping = guessColumnMapping(headers)
    const sample_rows = rows.slice(0, 5)

    let other_campaign_duplicates: {
      count: number
      samples: { nombre: string; campaign_name: string; match_type: string }[]
    } | null = null

    if (column_mapping && !validateMapping(column_mapping)) {
      const mapping = column_mapping as ColumnMapping
      const leads = rows.map((row) => {
        const f = applyColumnMapping(row, mapping)
        return { dedupeKey: f.dedupeKey, telefono: f.telefono, nombre: f.nombre }
      })
      const index = await findOtherCampaignMatchesForLeads(id, leads)
      other_campaign_duplicates = summarizeOtherCampaignMatches(leads, index)
    }

    return res.status(200).json({
      headers,
      sample_rows,
      suggested_mapping,
      rows_total: rows.length,
      existing_mapping: campaign.column_mapping,
      existing_columns: campaign.import_columns,
      other_campaign_duplicates,
    })
  } catch (error) {
    console.error('[coldcall/campaigns/[id]/import/preview]', error)
    const msg = error instanceof Error ? error.message : 'Error al previsualizar'
    return res.status(500).json({ error: msg })
  }
}
