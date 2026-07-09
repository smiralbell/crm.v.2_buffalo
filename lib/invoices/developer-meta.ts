import { prisma } from '@/lib/prisma'

export type InvoiceDeveloperMeta = {
  invoice_source: string
  developer_name: string | null
  has_pdf: boolean
}

export async function getInvoiceDeveloperMetaMap(
  invoiceIds: number[]
): Promise<Map<number, InvoiceDeveloperMeta>> {
  const map = new Map<number, InvoiceDeveloperMeta>()
  if (invoiceIds.length === 0) return map

  try {
    const rows = await prisma.$queryRaw<
      { id: number; invoice_source: string; developer_name: string | null; developer_pdf_path: string | null }[]
    >`
      SELECT i.id,
             COALESCE(i.invoice_source, 'client') AS invoice_source,
             u.name AS developer_name,
             i.developer_pdf_path
      FROM invoices i
      LEFT JOIN crm_users u ON u.id = i.crm_user_id
      WHERE i.id = ANY(${invoiceIds}::int[])
    `
    for (const row of rows) {
      map.set(row.id, {
        invoice_source: row.invoice_source,
        developer_name: row.developer_name,
        has_pdf: Boolean(row.developer_pdf_path),
      })
    }
  } catch {
    for (const id of invoiceIds) {
      map.set(id, { invoice_source: 'client', developer_name: null, has_pdf: false })
    }
  }
  return map
}

export async function getDeveloperInvoiceIds(): Promise<number[]> {
  try {
    const rows = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM invoices
      WHERE deleted_at IS NULL AND invoice_source = 'developer'
    `
    return rows.map((r) => r.id)
  } catch {
    return []
  }
}
