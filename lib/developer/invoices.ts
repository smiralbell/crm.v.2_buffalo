import { prisma } from '@/lib/prisma'
import { removeDevInvoicePdf } from '@/lib/developer/invoice-pdf'

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
  developer_pdf_path: string | null
  has_pdf: boolean
}

export class DeveloperInvoicesConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeveloperInvoicesConfigError'
  }
}

function isMissingColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('invoice_source') ||
    msg.includes('crm_user_id') ||
    msg.includes('developer_pdf_path') ||
    msg.includes('does not exist')
  )
}

const MIGRATION_HINT =
  'Ejecuta en la base de datos: prisma/ALTER_INVOICES_DEVELOPER.sql y prisma/ALTER_INVOICES_DEVELOPER_PDF.sql'

function mapRow(r: {
  id: number
  invoice_number: string
  status: string
  client_name: string
  subtotal: string | number
  iva: string | number
  total: string | number
  issue_date: Date
  created_at: Date
  developer_pdf_path?: string | null
}): DeveloperInvoiceRow {
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
    developer_pdf_path: r.developer_pdf_path ?? null,
    has_pdf: Boolean(r.developer_pdf_path),
  }
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
        developer_pdf_path: string | null
      }[]
    >`
      SELECT id, invoice_number, status, client_name, subtotal, iva, total,
             issue_date, created_at, developer_pdf_path
      FROM invoices
      WHERE deleted_at IS NULL
        AND invoice_source = 'developer'
        AND crm_user_id = ${userId}
      ORDER BY issue_date DESC, created_at DESC
    `
    return rows.map(mapRow)
  } catch (err) {
    if (!isMissingColumnError(err)) throw err
    const rows = await prisma.$queryRaw<
      Omit<
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
        },
        never
      >[]
    >`
      SELECT id, invoice_number, status, client_name, subtotal, iva, total,
             issue_date, created_at
      FROM invoices
      WHERE deleted_at IS NULL
        AND crm_user_id = ${userId}
        AND invoice_number LIKE 'DEV-%'
      ORDER BY issue_date DESC, created_at DESC
    `
    return rows.map((r) => mapRow({ ...r, developer_pdf_path: null }))
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
  const status = data.status || 'draft'

  try {
    const rows = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO invoices (
        invoice_number, client_name, client_company_name,
        issue_date, services, subtotal, iva, total, status,
        invoice_source, crm_user_id, company_name,
        created_at, updated_at
      ) VALUES (
        ${data.invoice_number},
        'Agencia Buffalo',
        'BUFFALO AI',
        ${issueDate}::date,
        ${JSON.stringify(data.services)}::jsonb,
        ${data.subtotal},
        ${data.iva},
        ${data.total},
        ${status},
        'developer',
        ${userId},
        'BUFFALO AI',
        NOW(),
        NOW()
      )
      RETURNING id
    `
    const id = rows[0]?.id ?? 0
    if (!id) throw new DeveloperInvoicesConfigError(MIGRATION_HINT)
    return id
  } catch (err) {
    if (isMissingColumnError(err)) {
      throw new DeveloperInvoicesConfigError(MIGRATION_HINT)
    }
    throw err
  }
}

export async function setDeveloperInvoicePdfPath(
  userId: number,
  invoiceId: number,
  relativePath: string
): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ id: number }[]>`
      UPDATE invoices
      SET developer_pdf_path = ${relativePath}, updated_at = NOW()
      WHERE id = ${invoiceId}
        AND crm_user_id = ${userId}
        AND invoice_source = 'developer'
        AND deleted_at IS NULL
      RETURNING id
    `
    return rows.length > 0
  } catch (err) {
    if (isMissingColumnError(err)) {
      throw new DeveloperInvoicesConfigError(MIGRATION_HINT)
    }
    throw err
  }
}

export async function getDeveloperInvoicePdfPath(
  invoiceId: number
): Promise<{ path: string; userId: number; invoice_number: string } | null> {
  try {
    const rows = await prisma.$queryRaw<
      { developer_pdf_path: string | null; crm_user_id: number; invoice_number: string }[]
    >`
      SELECT developer_pdf_path, crm_user_id, invoice_number
      FROM invoices
      WHERE id = ${invoiceId}
        AND deleted_at IS NULL
        AND invoice_source = 'developer'
      LIMIT 1
    `
    const r = rows[0]
    if (!r?.developer_pdf_path || !r.crm_user_id) return null
    return {
      path: r.developer_pdf_path,
      userId: r.crm_user_id,
      invoice_number: r.invoice_number,
    }
  } catch {
    return null
  }
}

export async function deleteDeveloperInvoice(userId: number, invoiceId: number): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ developer_pdf_path: string | null }[]>`
      UPDATE invoices
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${invoiceId}
        AND crm_user_id = ${userId}
        AND invoice_source = 'developer'
        AND deleted_at IS NULL
      RETURNING developer_pdf_path
    `
    if (!rows[0]) return false
    await removeDevInvoicePdf(rows[0].developer_pdf_path)
    return true
  } catch (err) {
    if (isMissingColumnError(err)) {
      throw new DeveloperInvoicesConfigError(MIGRATION_HINT)
    }
    throw err
  }
}

export async function getDeveloperInvoice(
  userId: number,
  invoiceId: number
): Promise<(DeveloperInvoiceRow & { services: unknown }) | null> {
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
        developer_pdf_path: string | null
      }[]
    >`
      SELECT id, invoice_number, status, client_name, subtotal, iva, total,
             issue_date, created_at, services, developer_pdf_path
      FROM invoices
      WHERE id = ${invoiceId}
        AND deleted_at IS NULL
        AND invoice_source = 'developer'
        AND crm_user_id = ${userId}
      LIMIT 1
    `
    const r = rows[0]
    if (!r) return null
    return { ...mapRow(r), services: r.services }
  } catch (err) {
    if (!isMissingColumnError(err)) throw err
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
        AND crm_user_id = ${userId}
        AND invoice_number LIKE 'DEV-%'
      LIMIT 1
    `
    const r = rows[0]
    if (!r) return null
    return { ...mapRow({ ...r, developer_pdf_path: null }), services: r.services }
  }
}
