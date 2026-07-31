import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import React from 'react'
import { pdf } from '@react-pdf/renderer'
import { InvoicePDF } from '@/components/InvoicePDF'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createPlaceholderNotePdfBuffer } from '@/lib/pdf/placeholder-note-pdf'
import { uploadInvoiceToDrive } from '@/lib/integrations/google/drive-invoices'

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
    const services = Array.isArray(invoice.services) ? invoice.services : []
    const servicesWithTotals = services.map((service: any) => ({
      description: service.description || '',
      quantity: service.quantity || 0,
      price: service.price || 0,
      tax: service.tax || 0,
      total: (service.quantity || 0) * (service.price || 0) * (1 + ((service.tax || 0) / 100)),
    }))

    // Cargar el logo y convertirlo a base64
    let logoBase64 = ''
    try {
      const logoPath = join(process.cwd(), 'public', 'buffalo-logo.png')
      const logoBuffer = await readFile(logoPath)
      logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch (logoError) {
      // Solo loguear en desarrollo
      if (process.env.NODE_ENV === 'development') {
        console.warn('[WARN] No se pudo cargar el logo:', logoError)
      }
      // Continuar sin logo si no se encuentra
    }

    // Generar el PDF
    const pdfDoc = React.createElement(InvoicePDF, {
      invoiceNumber: invoice.invoice_number,
      clientName: invoice.client_name,
      clientCompanyName: invoice.client_company_name || undefined,
      clientEmail: invoice.client_email || undefined,
      clientAddress: invoice.client_address || undefined,
      clientTaxId: invoice.client_tax_id || undefined,
      companyName: invoice.company_name || 'BUFFALO AI',
      companyAddress: invoice.company_address || undefined,
      issueDate: invoice.issue_date.toISOString(),
      dueDate: invoice.due_date?.toISOString() || undefined,
      services: servicesWithTotals,
      subtotal: Number(invoice.subtotal),
      iva: Number(invoice.iva),
      total: Number(invoice.total),
      logoUrl: logoBase64 || undefined,
    })

    // Generar el buffer del PDF
    const pdfBlob = await pdf(pdfDoc as any).toBlob()
    pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer())
    pdfFileName = `factura_${invoice.invoice_number}.pdf`
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

