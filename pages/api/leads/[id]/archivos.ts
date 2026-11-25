import type { NextApiRequest, NextApiResponse } from 'next'
import { canSeeClientPrices } from '@/lib/price-visibility'
import { isPersonaDriveConfigured, listPersonaDocumentos, savedFolder } from '@/lib/leads/archivos'
import { autoRelateInvoices, listLinkedInvoices, suggestInvoicesByName } from '@/lib/leads/facturas'
import { isSessionError, requireLeadPage } from '@/lib/leads/lead-api-guard'

/** Documentos, carpeta de Drive y facturas vinculadas de un lead. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireLeadPage(req, res)
    if (!ctx) return
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const showPrices = canSeeClientPrices(ctx.user.role)

    // Las facturas claramente de este cliente (mismo email o CIF) se vinculan solas
    if (showPrices) await autoRelateInvoices(ctx.leadId).catch(() => 0)
    const [documentos, carpeta, facturas, sugeridas] = await Promise.all([
      listPersonaDocumentos(ctx.leadId),
      savedFolder(ctx.leadId),
      showPrices ? listLinkedInvoices(ctx.leadId) : Promise.resolve([]),
      showPrices ? suggestInvoicesByName(ctx.leadId).catch(() => []) : Promise.resolve([]),
    ])
    return res.json({
      drive_configured: isPersonaDriveConfigured(),
      carpeta,
      documentos,
      facturas,
      facturas_sugeridas: sugeridas,
      can_see_invoices: showPrices,
    })
  } catch (error) {
    if (isSessionError(error)) return
    console.error('[leads/archivos]', error)
    return res.status(500).json({ error: 'Error al cargar los archivos' })
  }
}
