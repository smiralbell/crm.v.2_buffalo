import React from 'react'
import { pdf } from '@react-pdf/renderer'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { InvoicePDF } from '@/components/InvoicePDF'
import { deleteDriveFile, uploadPdfToDrive } from './google-drive'

type InvoiceRecord = {
  id: number
  invoice_number: string
  client_name: string
  client_company_name: string | null
  client_email: string | null
  client_address: string | null
  client_tax_id: string | null
  company_name: string | null
  company_address: string | null
  issue_date: Date
  due_date: Date | null
  services: any
  subtotal: any
  iva: any
  total: any
  status: string
  pdf_drive_file_id: string | null
  pdf_drive_url: string | null
  sent_to_drive: boolean | null
  bank_transaction_id: string | null
  deleted_at: Date | null
  created_at: Date
  updated_at: Date
}

type ExpenseDriveRow = {
  id: number
  date_start: Date
  name: string
  pdf_drive_file_id: string | null
}

async function loadLogoBase64(): Promise<string | undefined> {
  try {
    const logoPath = join(process.cwd(), 'public', 'buffalo-logo.png')
    const logoBuffer = await readFile(logoPath)
    return `data:image/png;base64,${logoBuffer.toString('base64')}`
  } catch {
    return undefined
  }
}

async function buildInvoicePdfBuffer(invoice: InvoiceRecord): Promise<Buffer> {
  const services = Array.isArray(invoice.services) ? invoice.services : []
  const servicesWithTotals = services.map((service: any) => ({
    description: service.description || '',
    quantity: service.quantity || 0,
    price: service.price || 0,
    tax: service.tax || 0,
    total:
      (service.quantity || 0) *
      (service.price || 0) *
      (1 + (service.tax || 0) / 100),
  }))

  const logoBase64 = await loadLogoBase64()

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
    logoUrl: logoBase64,
  })

  const pdfBlob = await pdf(pdfDoc as any).toBlob()
  return Buffer.from(await pdfBlob.arrayBuffer())
}

export async function getInvoiceById(id: number): Promise<InvoiceRecord | null> {
  return prisma.invoice.findUnique({
    where: { id, deleted_at: null },
  }) as Promise<InvoiceRecord | null>
}

export async function syncInvoicePdfToDrive(invoiceId: number) {
  const invoice = await getInvoiceById(invoiceId)
  if (!invoice) {
    throw new Error('Factura no encontrada')
  }

  const pdfBuffer = await buildInvoicePdfBuffer(invoice)
  const fileName = `factura_${invoice.invoice_number}.pdf`
  const yearMonth = invoice.issue_date.toISOString().slice(0, 7)

  const uploaded = await uploadPdfToDrive({
    kind: 'emitidas',
    yearMonth,
    fileName,
    buffer: pdfBuffer,
    mimeType: 'application/pdf',
  })

  if (invoice.pdf_drive_file_id) {
    await deleteDriveFile(invoice.pdf_drive_file_id)
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      pdf_drive_file_id: uploaded.id,
      pdf_drive_url: uploaded.url,
      sent_to_drive: true,
    },
  })

  return uploaded
}

export async function removeInvoicePdfFromDrive(invoiceId: number) {
  const invoice = await getInvoiceById(invoiceId)
  if (!invoice) {
    throw new Error('Factura no encontrada')
  }

  if (invoice.pdf_drive_file_id) {
    await deleteDriveFile(invoice.pdf_drive_file_id)
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      pdf_drive_file_id: null,
      pdf_drive_url: null,
      sent_to_drive: false,
    },
  })
}

export async function getExpenseDriveRow(expenseId: number): Promise<ExpenseDriveRow | null> {
  const result = await query<ExpenseDriveRow>(
    `SELECT id, date_start, name, pdf_drive_file_id
       FROM expenses
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [expenseId]
  )
  return result.rows[0] || null
}

export async function syncExpensePdfToDrive(params: {
  expenseId: number
  fileName: string
  buffer: Buffer
  mimeType?: string
}) {
  const expense = await getExpenseDriveRow(params.expenseId)
  if (!expense) {
    throw new Error('Gasto no encontrado')
  }

  const yearMonth = expense.date_start.toISOString().slice(0, 7)
  const uploaded = await uploadPdfToDrive({
    kind: 'gastos',
    yearMonth,
    fileName: params.fileName,
    buffer: params.buffer,
    mimeType: params.mimeType || 'application/pdf',
  })

  if (expense.pdf_drive_file_id) {
    await deleteDriveFile(expense.pdf_drive_file_id)
  }

  await query(
    `UPDATE expenses
        SET pdf_drive_file_id = $1,
            pdf_drive_url = $2,
            sent_to_drive = true,
            updated_at = NOW()
      WHERE id = $3`,
    [uploaded.id, uploaded.url, params.expenseId]
  )

  return uploaded
}

export async function removeExpensePdfFromDrive(expenseId: number) {
  const expense = await getExpenseDriveRow(expenseId)
  if (!expense) return

  if (expense.pdf_drive_file_id) {
    await deleteDriveFile(expense.pdf_drive_file_id)
  }

  await query(
    `UPDATE expenses
        SET pdf_drive_file_id = NULL,
            pdf_drive_url = NULL,
            sent_to_drive = false,
            updated_at = NOW()
      WHERE id = $1`,
    [expenseId]
  )
}
