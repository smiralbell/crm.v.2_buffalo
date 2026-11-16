import React from 'react'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { format } from 'date-fns'
import { pdf } from '@react-pdf/renderer'
import type { Invoice } from '@prisma/client'
import { InvoicePDF } from '@/components/InvoicePDF'
import { prisma } from '@/lib/prisma'
import { pdfDocumentFields } from '@/lib/invoices/document'

let logoCache: string | null | undefined

async function logoDataUrl(): Promise<string | undefined> {
  if (logoCache !== undefined) return logoCache || undefined
  try {
    const buffer = await readFile(join(process.cwd(), 'public', 'buffalo-logo.png'))
    logoCache = `data:image/png;base64,${buffer.toString('base64')}`
  } catch {
    logoCache = null
  }
  return logoCache || undefined
}

/** El PDF de una factura emitida, igual que el que se sube a Drive. */
export async function renderInvoicePdf(invoice: Invoice): Promise<{ buffer: Buffer; filename: string }> {
  const services = Array.isArray(invoice.services) ? (invoice.services as Record<string, unknown>[]) : []
  const servicesWithTotals = services.map((service) => {
    const quantity = Number(service.quantity) || 0
    const price = Number(service.price) || 0
    const tax = Number(service.tax) || 0
    return {
      description: String(service.description || ''),
      quantity,
      price,
      tax,
      total: quantity * price * (1 + tax / 100),
    }
  })

  let rectifiesNumber: string | null = null
  let rectifiesDateLabel: string | null = null
  if (invoice.rectifies_invoice_id) {
    const original = await prisma.invoice.findUnique({
      where: { id: invoice.rectifies_invoice_id },
      select: { invoice_number: true, issue_date: true },
    })
    if (original) {
      rectifiesNumber = original.invoice_number
      rectifiesDateLabel = format(original.issue_date, 'dd/MM/yyyy')
    }
  }

  const documentFields = pdfDocumentFields({
    document_type: invoice.document_type,
    document_title: invoice.document_title,
    observations: invoice.observations,
    rectification_reason: invoice.rectification_reason,
    show_payment_info: invoice.show_payment_info,
    payment_method: invoice.payment_method,
    bank_name: invoice.bank_name,
    bank_account_holder: invoice.bank_account_holder,
    iban: invoice.iban,
    payment_instructions: invoice.payment_instructions,
    rectifiesNumber,
    rectifiesDateLabel,
  })

  const doc = React.createElement(InvoicePDF, {
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
    logoUrl: await logoDataUrl(),
    ...documentFields,
  })

  const blob = await pdf(doc as any).toBlob()
  return {
    buffer: Buffer.from(await blob.arrayBuffer()),
    filename: `factura_${invoice.invoice_number}.pdf`,
  }
}
