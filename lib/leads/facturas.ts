import { prisma } from '@/lib/prisma'
import { addInvoiceShortcut, isPersonaDriveConfigured } from '@/lib/leads/archivos'

export type PersonaFactura = {
  id: number
  invoice_number: string
  client_name: string
  issue_date: string
  total: number
  status: string
  pdf_drive_url: string | null
}

function mapInvoice(inv: {
  id: number
  invoice_number: string
  client_name: string
  issue_date: Date
  total: unknown
  status: string
  pdf_drive_url: string | null
}): PersonaFactura {
  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    client_name: inv.client_name,
    issue_date: inv.issue_date.toISOString().slice(0, 10),
    total: Number(inv.total),
    status: inv.status,
    pdf_drive_url: inv.pdf_drive_url,
  }
}

export async function listLinkedInvoices(leadId: number): Promise<PersonaFactura[]> {
  const rows = await prisma.invoice.findMany({
    where: { lead_id: leadId, deleted_at: null },
    orderBy: { issue_date: 'desc' },
    select: {
      id: true,
      invoice_number: true,
      client_name: true,
      issue_date: true,
      total: true,
      status: true,
      pdf_drive_url: true,
    },
  })
  return rows.map(mapInvoice)
}

/** Facturas que se pueden vincular: búsqueda por número o cliente. */
export async function searchLinkableInvoices(q: string): Promise<PersonaFactura[]> {
  const term = q.trim()
  if (term.length < 2) return []
  const rows = await prisma.invoice.findMany({
    where: {
      deleted_at: null,
      invoice_source: 'client',
      OR: [
        { invoice_number: { contains: term, mode: 'insensitive' } },
        { client_name: { contains: term, mode: 'insensitive' } },
        { client_company_name: { contains: term, mode: 'insensitive' } },
      ],
    },
    orderBy: { issue_date: 'desc' },
    take: 20,
    select: {
      id: true,
      invoice_number: true,
      client_name: true,
      issue_date: true,
      total: true,
      status: true,
      pdf_drive_url: true,
    },
  })
  return rows.map(mapInvoice)
}

/**
 * Vincula una factura a la persona. Solo si la persona tiene contacto.
 * Si hay Drive configurado y la factura tiene PDF, deja un acceso directo en su carpeta.
 * Devuelve un aviso si el acceso directo no se pudo crear (la vinculación sí se guarda).
 */
export async function linkInvoiceToPersona(
  leadId: number,
  invoiceId: number
): Promise<{ warning: string | null }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { contact_id: true },
  })
  if (!lead?.contact_id) {
    throw new Error('No se puede vincular una factura a una persona sin contacto')
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, deleted_at: null },
    select: { id: true, invoice_number: true, pdf_drive_file_id: true },
  })
  if (!invoice) throw new Error('Factura no encontrada')

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { lead_id: leadId },
  })

  if (!invoice.pdf_drive_file_id || !isPersonaDriveConfigured()) {
    return { warning: null }
  }
  try {
    await addInvoiceShortcut({
      leadId,
      invoiceNumber: invoice.invoice_number,
      pdfDriveFileId: invoice.pdf_drive_file_id,
    })
    return { warning: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error desconocido'
    console.error('[leads/facturas] acceso directo', msg)
    return { warning: `Factura vinculada, pero no se pudo añadir a la carpeta de Drive: ${msg}` }
  }
}

export async function unlinkInvoiceFromPersona(leadId: number, invoiceId: number): Promise<void> {
  const res = await prisma.invoice.updateMany({
    where: { id: invoiceId, lead_id: leadId },
    data: { lead_id: null },
  })
  if (res.count === 0) throw new Error('La factura no está vinculada a esta persona')
}
