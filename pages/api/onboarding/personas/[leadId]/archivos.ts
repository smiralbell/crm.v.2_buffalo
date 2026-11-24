import type { NextApiRequest, NextApiResponse } from 'next'
import { requireLeadAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { isPersonaDriveConfigured, listPersonaDocumentos, savedFolder } from '@/lib/onboarding/persona-archivos'
import { listLinkedInvoices } from '@/lib/onboarding/persona-facturas'

/** Documentos, carpeta de Drive y facturas vinculadas de una persona. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireLeadAccessAPI(req, res, req.query.leadId)
    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) return res.status(400).json({ error: 'leadId inválido' })
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const [documentos, carpeta, facturas] = await Promise.all([
      listPersonaDocumentos(leadId),
      savedFolder(leadId),
      listLinkedInvoices(leadId),
    ])
    return res.json({
      drive_configured: isPersonaDriveConfigured(),
      carpeta,
      documentos,
      facturas,
    })
  } catch (error) {
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[onboarding/personas/archivos]', error)
    return res.status(500).json({ error: 'Error al cargar los archivos' })
  }
}
