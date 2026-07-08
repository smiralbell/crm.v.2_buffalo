import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { syncInvoicePdfToDrive } from '@/lib/drive/invoice-storage'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requireAuthAPI(req, res)

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const id = parseInt(req.query.id as string)

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid invoice ID' })
    }
    const uploaded = await syncInvoicePdfToDrive(id)

    return res.status(200).json({
      success: true,
      message: 'Factura enviada a Google Drive correctamente',
      file_id: uploaded.id,
      file_url: uploaded.url,
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'No session' || error.message === 'Invalid session' || error.message === 'Expired session')) {
      return // Ya se envió la respuesta 401
    }

    console.error('[ERROR] Send to drive API error:', error instanceof Error ? error.message : 'Error desconocido')
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

