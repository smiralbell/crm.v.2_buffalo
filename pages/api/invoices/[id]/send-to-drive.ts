import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { renderInvoicePdf } from '@/lib/invoices/pdf'
import { createPlaceholderNotePdfBuffer } from '@/lib/pdf/placeholder-note-pdf'
import { uploadInvoiceToDrive } from '@/lib/integrations/google/drive-invoices'
import { readDevInvoicePdf } from '@/lib/developer/invoice-pdf'
import { downloadDriveFile, syncDeveloperInvoiceToDrive } from '@/lib/developer/invoice-drive'

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

    // Obtener la factura con todos sus datos
    const invoice = await prisma.invoice.findUnique({
      where: { id, deleted_at: null },
    })

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' })
    }

    // Factura de developer: es un gasto. Se sube su PDF a GASTOS/<mes>, no uno generado.
    if (invoice.invoice_source === 'developer') {
      let devPdf: Buffer | null = null
      if (invoice.developer_pdf_path) {
        try {
          devPdf = await readDevInvoicePdf(invoice.developer_pdf_path)
        } catch {
          devPdf = null
        }
      }
      if (!devPdf && invoice.pdf_drive_file_id) {
        devPdf = await downloadDriveFile(invoice.pdf_drive_file_id)
      }
      if (!devPdf) {
        return res.status(400).json({ error: 'Esta factura de developer aún no tiene PDF adjunto' })
      }
      const synced = await syncDeveloperInvoiceToDrive(id, devPdf)
      if (!synced.ok) {
        return res.status(500).json({ error: 'Error al enviar la factura a Google Drive', details: synced.error })
      }
      return res.status(200).json({
        success: true,
        message: `Factura subida a Google Drive (GASTOS/${synced.yearMonth})`,
        drive: synced,
      })
    }

    const usePlaceholderPdf =
      req.body != null && typeof req.body === 'object' && 'no_invoice_note' in req.body
    const noInvoiceNote =
      typeof req.body?.no_invoice_note === 'string' ? req.body.no_invoice_note.trim() : ''

    let pdfBuffer: Buffer
    let pdfFileName: string

    if (usePlaceholderPdf) {
      pdfBuffer = createPlaceholderNotePdfBuffer(noInvoiceNote)
      pdfFileName = `sin_factura_${invoice.invoice_number}.pdf`
    } else {
    const rendered = await renderInvoicePdf(invoice)
    pdfBuffer = rendered.buffer
    pdfFileName = rendered.filename
    }

    try {
      const yearMonth = invoice.issue_date.toISOString().substring(0, 7)

      if (process.env.NODE_ENV === 'development') {
        console.log('[INFO] Subiendo factura a Drive:', invoice.invoice_number, yearMonth)
      }

      const driveResult = await uploadInvoiceToDrive({
        tipo: 'emitidas',
        yearMonth,
        fileName: pdfFileName,
        buffer: pdfBuffer,
        mimeType: 'application/pdf',
      })

      await prisma.invoice.update({
        where: { id },
        data: { sent_to_drive: true },
      })

      return res.status(200).json({
        success: true,
        message: 'Factura enviada a Google Drive correctamente',
        drive: driveResult,
      })
    } catch (driveError) {
      console.error(
        '[ERROR] Error al subir a Drive:',
        driveError instanceof Error ? driveError.message : 'Error desconocido'
      )
      return res.status(500).json({
        error: 'Error al enviar la factura a Google Drive',
        details: driveError instanceof Error ? driveError.message : 'Error desconocido',
      })
    }
  } catch (error) {
    if (error instanceof Error && (error.message === 'No session' || error.message === 'Invalid session' || error.message === 'Expired session')) {
      return // Ya se envió la respuesta 401
    }

    console.error('[ERROR] Send to drive API error:', error instanceof Error ? error.message : 'Error desconocido')
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

