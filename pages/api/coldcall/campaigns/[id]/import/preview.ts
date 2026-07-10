import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { parseCsvText } from '@/lib/coldcall/apollo-csv'
import { guessColumnMapping } from '@/lib/coldcall/field-mapping'
import { getCampaignById } from '@/lib/coldcall/campaigns'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!requireColdCallAPI(req, res)) return

    const id = parseInt(String(req.query.id), 10)
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' })

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const campaign = await getCampaignById(id)
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' })

    const { csv_text } = req.body as { csv_text?: string }
    if (!csv_text?.trim()) return res.status(400).json({ error: 'CSV vacío' })

    const rows = parseCsvText(csv_text)
    if (rows.length === 0) return res.status(400).json({ error: 'No se encontraron filas en el CSV' })

    const headers = Object.keys(rows[0])
    const suggested_mapping = guessColumnMapping(headers)
    const sample_rows = rows.slice(0, 5)

    return res.status(200).json({
      headers,
      sample_rows,
      suggested_mapping,
      rows_total: rows.length,
      existing_mapping: campaign.column_mapping,
      existing_columns: campaign.import_columns,
    })
  } catch (error) {
    console.error('[coldcall/campaigns/[id]/import/preview]', error)
    const msg = error instanceof Error ? error.message : 'Error al previsualizar'
    return res.status(500).json({ error: msg })
  }
}
