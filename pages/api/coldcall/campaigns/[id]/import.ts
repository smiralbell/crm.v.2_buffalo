import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { resolveCrmUserFkId } from '@/lib/crm-users'
import { parseCsvText } from '@/lib/coldcall/apollo-csv'
import {
  applyColumnMapping,
  type ColumnMapping,
  validateMapping,
} from '@/lib/coldcall/field-mapping'
import { getCampaignById, importLeadsToCampaign } from '@/lib/coldcall/campaigns'
import type { CsvLeadInput } from '@/lib/coldcall/types'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const id = parseInt(String(req.query.id), 10)
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' })

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const campaign = await getCampaignById(id)
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' })

    const { csv_text, file_name, column_mapping, import_columns } = req.body as {
      csv_text?: string
      file_name?: string
      column_mapping?: ColumnMapping
      import_columns?: string[]
    }

    if (!csv_text?.trim()) return res.status(400).json({ error: 'CSV vacío' })
    if (!import_columns?.length) return res.status(400).json({ error: 'Faltan columnas del CSV' })

    const mappingErr = validateMapping(column_mapping || {})
    if (mappingErr) return res.status(400).json({ error: mappingErr })

    const rows = parseCsvText(csv_text)
    if (rows.length === 0) return res.status(400).json({ error: 'No se encontraron filas en el CSV' })
    if (rows.length > 10000) return res.status(400).json({ error: 'Máximo 10.000 filas por importación' })

    const mapping = column_mapping as ColumnMapping
    const leads: CsvLeadInput[] = rows.map((row) => {
      const rawData = { ...row }
      const f = applyColumnMapping(row, mapping)
      return {
        rawData,
        nombre: f.nombre,
        firstName: f.firstName,
        lastName: f.lastName,
        telefono: f.telefono,
        email: f.email,
        empresa: f.empresa,
        cargo: f.cargo,
        sector: f.sector,
        ciudad: f.ciudad,
        linkedin: f.linkedin,
        web: f.web,
        cif: f.cif,
        direccion: f.direccion,
        doNotCall: f.doNotCall,
        dedupeKey: f.dedupeKey,
      }
    })

    const importedById = await resolveCrmUserFkId(user.id)
    const result = await importLeadsToCampaign({
      campaignId: id,
      fileName: file_name || 'import.csv',
      importedByUserId: importedById,
      leads,
      importColumns: import_columns,
      columnMapping: mapping,
    })

    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[coldcall/campaigns/[id]/import]', error)
    const msg = error instanceof Error ? error.message : 'Error al importar'
    return res.status(500).json({ error: msg })
  }
}
