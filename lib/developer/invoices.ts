import { prisma } from '@/lib/prisma'

export type DeveloperInvoiceRow = {
  id: number
  invoice_number: string
  status: string
  client_name: string
  subtotal: number
  iva: number
  total: number
  issue_date: Date
  created_at: Date
}

export async function listDeveloperInvoices(userId: number): Promise<DeveloperInvoiceRow[]> {
  try {
    const rows = await prisma.$queryRaw<
      {
        id: number
        invoice_number: string
        status: string
        client_name: string
        subtotal: string | number
        iva: string | number
        total: string | number
        issue_date: Date
        created_at: Date
      }[]
    >`
      SELECT id, invoice_number, status, client_name, subtotal, iva, total, issue_date, created_at
      FROM invoices
      WHERE deleted_at IS NULL
        AND invoice_source = 'developer'
        AND crm_user_id = ${userId}
      ORDER BY issue_date DESC, created_at DESC
    `
    return rows.map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      status: r.status,
      client_name: r.client_name,
      subtotal: Number(r.subtotal),
      iva: Number(r.iva),
      total: Number(r.total),
      issue_date: r.issue_date,
      created_at: r.created_at,
    }))
  } catch {
    return []
  }
}

export async function nextDeveloperInvoiceNumber(userId: number): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `DEV-${year}-${String(userId).padStart(3, '0')}-`
  try {
    const rows = await prisma.$queryRaw<{ invoice_number: string }[]>`
      SELECT invoice_number FROM invoices
      WHERE invoice_number LIKE ${prefix + '%'}
      ORDER BY invoice_number DESC
      LIMIT 1
    `
    let next = 1
    if (rows[0]) {
      const part = rows[0].invoice_number.slice(prefix.length)
      const n = parseInt(part, 10)
      if (!isNaN(n)) next = n + 1
    }
    return `${prefix}${String(next).padStart(4, '0')}`
  } catch {
    return `${prefix}0001`
  }
}

export async function createDeveloperInvoice(
  userId: number,
  data: {
    invoice_number: string
    services: unknown
    subtotal: number
    iva: number
    total: number
    issue_date?: string
    status?: string
  }
): Promise<number> {
  const issueDate = data.issue_date ? new Date(data.issue_date) : new Date()
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO invoices (
      invoice_number, client_name, client_company_name,
      issue_date, services, subtotal, iva, total, status,
      invoice_source, crm_user_id, company_name
    ) VALUES (
      ${data.invoice_number},
      'Agencia Buffalo',
      'BUFFALO AI',
      ${issueDate}::date,
      ${JSON.stringify(data.services)}::jsonb,
      ${data.subtotal},
      ${data.iva},
      ${data.total},
      ${data.status || 'draft'},
      'developer',
      ${userId},
      'BUFFALO AI'
    )
    RETURNING id
  `
  return rows[0]?.id ?? 0
}

export async function getDeveloperInvoice(
  userId: number,
  invoiceId: number
): Promise<DeveloperInvoiceRow & { services: unknown } | null> {
  try {
    const rows = await prisma.$queryRaw<
      {
        id: number
        invoice_number: string
        status: string
        client_name: string
        subtotal: string | number
        iva: string | number
        total: string | number
        issue_date: Date
        created_at: Date
        services: unknown
      }[]
    >`
      SELECT id, invoice_number, status, client_name, subtotal, iva, total,
             issue_date, created_at, services
      FROM invoices
      WHERE id = ${invoiceId}
        AND deleted_at IS NULL
        AND invoice_source = 'developer'
        AND crm_user_id = ${userId}
      LIMIT 1
    `
    const r = rows[0]
    if (!r) return null
    return {
      id: r.id,
      invoice_number: r.invoice_number,
      status: r.status,
      client_name: r.client_name,
      subtotal: Number(r.subtotal),
      iva: Number(r.iva),
      total: Number(r.total),
      issue_date: r.issue_date,
      created_at: r.created_at,
      services: r.services,
    }
  } catch {
    return null
  }
}
