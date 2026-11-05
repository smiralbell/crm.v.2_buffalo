import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { normalizeInvoiceDocument } from '@/lib/invoices/document'
import { getNextBufInvoiceNumber } from '@/lib/invoices/numbers'
import {
  formatSpanishDate,
  madridToday,
  maintenanceConcept,
  nextMonthOnDay,
  parseIsoDate,
} from '@/lib/invoices/recurring-dates'

export { formatSpanishDate, madridToday, nextMonthOnDay, parseIsoDate } from '@/lib/invoices/recurring-dates'

let columnsReady = false

export async function ensureRecurringInvoiceColumns(): Promise<void> {
  if (columnsReady) return
  await query(`ALTER TABLE recurring_invoices ALTER COLUMN source_invoice_id DROP NOT NULL`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS client_name TEXT`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS client_company_name TEXT`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS client_email TEXT`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS client_address TEXT`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS client_tax_id TEXT`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS line_description TEXT`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS base_amount NUMERIC(12, 2)`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5, 2)`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS next_issue_date DATE`)
  columnsReady = true
}

type RecurringRow = {
  id: string
  name: string
  source_invoice_id: number | null
  issue_day: number
  due_day: number | null
  is_active: boolean
  last_generated_period: string | null
  next_issue_date: string | null
  client_name: string | null
  client_company_name: string | null
  client_email: string | null
  client_address: string | null
  client_tax_id: string | null
  line_description: string | null
  base_amount: string | null
  tax_percent: string | null
}

export async function generateRecurringInvoice(
  id: string,
  opts?: { allowFuture?: boolean }
): Promise<
  | { ok: true; id: number; invoice_number: string; issue_date: string }
  | { ok: false; status: number; error: string }
> {
  await ensureRecurringInvoiceColumns()

  const found = await query<RecurringRow>(
    `SELECT id, name, source_invoice_id, issue_day, due_day, is_active,
            last_generated_period, next_issue_date::text AS next_issue_date,
            client_name, client_company_name, client_email, client_address, client_tax_id,
            line_description, base_amount::text AS base_amount, tax_percent::text AS tax_percent
       FROM recurring_invoices
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [id]
  )
  const recurring = found.rows[0]
  if (!recurring) return { ok: false, status: 404, error: 'Factura recurrente no encontrada' }
  if (!recurring.is_active) return { ok: false, status: 400, error: 'La plantilla recurrente está desactivada' }

  const today = madridToday()
  const scheduled = recurring.next_issue_date
  if (scheduled && scheduled > today && !opts?.allowFuture) {
    return {
      ok: false,
      status: 400,
      error: `Esta factura se creará el ${formatSpanishDate(scheduled)}. Todavía no toca.`,
    }
  }

  const issueIso = scheduled && scheduled <= today ? scheduled : scheduled && opts?.allowFuture ? scheduled : null
  let year: number
  let month: number
  let issueDay: number
  let period: string

  if (issueIso) {
    const parsed = parseIsoDate(issueIso)
    if (!parsed) return { ok: false, status: 400, error: 'La fecha de emisión no es válida' }
    year = parsed.year
    month = parsed.month
    issueDay = parsed.day
    period = issueIso.slice(0, 7)
  } else {
    const now = parseIsoDate(today)
    if (!now) return { ok: false, status: 500, error: 'No se pudo calcular la fecha' }
    year = now.year
    month = now.month
    const dim = new Date(Date.UTC(year, month, 0)).getUTCDate()
    issueDay = Math.min(recurring.issue_day, dim)
    period = today.slice(0, 7)
  }

  if (recurring.last_generated_period === period) {
    return { ok: false, status: 400, error: 'Esta plantilla ya generó la factura de este mes' }
  }

  const dueDay =
    recurring.due_day == null
      ? null
      : Math.min(recurring.due_day, new Date(Date.UTC(year, month, 0)).getUTCDate())

  let clientName = recurring.client_name?.trim() || ''
  let clientCompany = recurring.client_company_name
  let clientEmail = recurring.client_email
  let clientAddress = recurring.client_address
  let clientTaxId = recurring.client_tax_id
  let companyName = 'BUFFALO AI'
  let companyAddress: string | null = null
  let services: { description: string; quantity: number; price: number; tax: number }[]
  let copiedTotals: { subtotal: number; iva: number; total: number; services: unknown } | null = null

  if (recurring.source_invoice_id && !recurring.line_description) {
    const source = await prisma.invoice.findUnique({
      where: { id: recurring.source_invoice_id, deleted_at: null },
    })
    if (!source) return { ok: false, status: 404, error: 'La factura base ya no existe' }
    if (source.document_type && source.document_type !== 'invoice') {
      return {
        ok: false,
        status: 400,
        error: 'Solo se puede repetir una factura normal. La factura original no se modifica.',
      }
    }
    clientName = clientName || source.client_name
    clientCompany = clientCompany || source.client_company_name
    clientEmail = clientEmail || source.client_email
    clientAddress = clientAddress || source.client_address
    clientTaxId = clientTaxId || source.client_tax_id
    companyName = source.company_name || companyName
    companyAddress = source.company_address
    copiedTotals = {
      subtotal: Number(source.subtotal),
      iva: Number(source.iva),
      total: Number(source.total),
      services: source.services,
    }
    services = []
  } else {
    const description = recurring.line_description?.trim() || ''
    const price = Number(recurring.base_amount)
    const tax = recurring.tax_percent == null ? 21 : Number(recurring.tax_percent)
    const issueIsoForConcept =
      issueIso || `${year}-${String(month).padStart(2, '0')}-${String(issueDay).padStart(2, '0')}`
    services = [
      {
        description: maintenanceConcept(description, issueIsoForConcept, recurring.issue_day),
        quantity: 1,
        price,
        tax,
      },
    ]
  }

  const normalized = copiedTotals
    ? { ok: true as const, value: copiedTotals }
    : normalizeInvoiceDocument({
        document_type: 'invoice',
        services,
        status: 'draft',
      })
  if (!normalized.ok) return { ok: false, status: 400, error: normalized.error }
  if (!clientName) return { ok: false, status: 400, error: 'Falta el nombre del cliente' }

  const claimed = await query(
    `UPDATE recurring_invoices
        SET last_generated_period = $2, updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
        AND is_active = TRUE
        AND (last_generated_period IS DISTINCT FROM $2)
      RETURNING id`,
    [id, period]
  )
  if (claimed.rowCount === 0) {
    return { ok: false, status: 400, error: 'Esta plantilla ya generó la factura de este mes' }
  }

  let createdId: number | null = null
  try {
    const invoiceNumber = await getNextBufInvoiceNumber(year)
    const issueDate = new Date(Date.UTC(year, month - 1, issueDay))
    const dueDate = dueDay == null ? null : new Date(Date.UTC(year, month - 1, dueDay))
    const created = await prisma.invoice.create({
      data: {
        invoice_number: invoiceNumber,
        client_name: clientName,
        client_company_name: clientCompany,
        client_email: clientEmail,
        client_address: clientAddress,
        client_tax_id: clientTaxId,
        company_name: companyName,
        company_address: companyAddress,
        issue_date: issueDate,
        due_date: dueDate,
        services: normalized.value.services as any,
        subtotal: normalized.value.subtotal,
        iva: normalized.value.iva,
        total: normalized.value.total,
        status: 'draft',
        document_type: 'invoice',
      },
    })
    createdId = created.id

    const following = scheduled ? nextMonthOnDay(issueIso || scheduled, recurring.issue_day) : null
    await query(
      `UPDATE recurring_invoices
          SET last_generated_at = NOW(),
              last_generated_invoice_id = $2,
              next_issue_date = COALESCE($3::date, next_issue_date),
              updated_at = NOW()
        WHERE id = $1`,
      [id, created.id, following]
    )

    return {
      ok: true,
      id: created.id,
      invoice_number: created.invoice_number,
      issue_date: issueIso || `${year}-${String(month).padStart(2, '0')}-${String(issueDay).padStart(2, '0')}`,
    }
  } catch (error) {
    if (createdId == null) {
      await query(
        `UPDATE recurring_invoices
            SET last_generated_period = $2, updated_at = NOW()
          WHERE id = $1`,
        [id, recurring.last_generated_period]
      )
    }
    throw error
  }
}

export async function runDueRecurringInvoices(): Promise<number> {
  await ensureRecurringInvoiceColumns()
  const due = await query<{ id: string }>(
    `SELECT id
       FROM recurring_invoices
      WHERE deleted_at IS NULL
        AND is_active = TRUE
        AND next_issue_date IS NOT NULL
        AND next_issue_date <= (timezone('Europe/Madrid', now()))::date
      ORDER BY next_issue_date ASC
      LIMIT 20`
  )
  let created = 0
  for (const row of due.rows) {
    for (let step = 0; step < 6; step += 1) {
      const result = await generateRecurringInvoice(row.id)
      if (!result.ok) break
      created += 1
    }
  }
  return created
}
