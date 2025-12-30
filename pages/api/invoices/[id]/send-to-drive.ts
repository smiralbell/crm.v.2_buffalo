import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import React from 'react'
import { pdf } from '@react-pdf/renderer'
import { InvoicePDF } from '@/components/InvoicePDF'
import { readFile } from 'fs/promises'
import { join } from 'path'
import FormData from 'form-data'
import fetch from 'node-fetch'

const WEBHOOK_URL = 'https://n8n.agenciabuffalo.es/webhook/0a19bd04-25b5-4f9a-b4f9-9037a7e02996'

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

    // Preparar servicios para el PDF
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
      console.warn('No se pudo cargar el logo, continuando sin él:', logoError)
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
    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer())
    const pdfFileName = `factura_${invoice.invoice_number}.pdf`

    // Preparar FormData para enviar el PDF y los datos
    const formData = new FormData()
    
    // Añadir el PDF como archivo
    formData.append('pdf', pdfBuffer, {
      filename: pdfFileName,
      contentType: 'application/pdf',
    })
    
    // Añadir todos los datos de la factura
    formData.append('id', invoice.id.toString())
    formData.append('invoice_number', invoice.invoice_number)
    formData.append('client_name', invoice.client_name)
    if (invoice.client_company_name) formData.append('client_company_name', invoice.client_company_name)
    if (invoice.client_email) formData.append('client_email', invoice.client_email)
    if (invoice.client_address) formData.append('client_address', invoice.client_address)
    if (invoice.client_tax_id) formData.append('client_tax_id', invoice.client_tax_id)
    if (invoice.company_name) formData.append('company_name', invoice.company_name)
    if (invoice.company_address) formData.append('company_address', invoice.company_address)
    formData.append('issue_date', invoice.issue_date.toISOString().split('T')[0])
    if (invoice.due_date) formData.append('due_date', invoice.due_date.toISOString().split('T')[0])
    formData.append('subtotal', Number(invoice.subtotal).toFixed(2))
    formData.append('iva', Number(invoice.iva).toFixed(2))
    formData.append('total', Number(invoice.total).toFixed(2))
    formData.append('status', invoice.status)
    formData.append('services', JSON.stringify(invoice.services || []))
    formData.append('created_at', invoice.created_at.toISOString())
    formData.append('updated_at', invoice.updated_at.toISOString())

    // Enviar al webhook en modo POST con FormData (incluye el PDF)
    try {
      console.log('Enviando factura al webhook:', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        pdfSize: pdfBuffer.length,
        pdfFileName,
      })

      // Extraer año y mes de la fecha de emisión (formato: aaaa-mm)
      const yearMonth = invoice.issue_date.toISOString().substring(0, 7) // YYYY-MM

      // Añadir el nombre del archivo, año-mes, tipo y otros datos como parámetros en la URL
      const webhookUrlWithParams = `${WEBHOOK_URL}?pdf_filename=${encodeURIComponent(pdfFileName)}&invoice_id=${invoice.id}&invoice_number=${encodeURIComponent(invoice.invoice_number)}&year_month=${yearMonth}&type=emitida`

      const webhookResponse = await fetch(webhookUrlWithParams, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders(),
      })

      if (!webhookResponse.ok) {
        const errorText = await webhookResponse.text().catch(() => 'No se pudo leer la respuesta del webhook')
        console.error(`Webhook error ${webhookResponse.status}:`, errorText)
        throw new Error(`El webhook respondió con estado ${webhookResponse.status}. ${errorText.substring(0, 200)}`)
      }

      // Actualizar el estado en la base de datos
      await prisma.invoice.update({
        where: { id },
        data: { sent_to_drive: true },
      })

      return res.status(200).json({
        success: true,
        message: 'Factura enviada a Google Drive correctamente',
      })
    } catch (webhookError) {
      console.error('Error al enviar al webhook:', webhookError)
      return res.status(500).json({
        error: 'Error al enviar la factura al webhook',
        details: webhookError instanceof Error ? webhookError.message : 'Error desconocido',
      })
    }
  } catch (error) {
    if (error instanceof Error && (error.message === 'No session' || error.message === 'Invalid session' || error.message === 'Expired session')) {
      return // Ya se envió la respuesta 401
    }

    console.error('Send to drive API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

