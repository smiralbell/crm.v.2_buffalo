import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

async function getNextInvoiceNumber() {
  const year = new Date().getFullYear()
  const lastInvoice = await prisma.invoice.findFirst({
    where: {
      invoice_number: {
        startsWith: `BUF-${year}-`,
      },
    },
    orderBy: {
      invoice_number: 'desc',
    },
  })

  let nextNumber = 1
  if (lastInvoice) {
    const parts = lastInvoice.invoice_number.split('-')
    if (parts.length >= 3) {
      const lastNum = parseInt(parts[2] || '0', 10)
      if (!Number.isNaN(lastNum)) nextNumber = lastNum + 1
    }
  }

  let invoiceNumber = `BUF-${year}-${String(nextNumber).padStart(4, '0')}`
  let attempts = 0
  while (attempts < 100) {
    const exists = await prisma.invoice.findUnique({
      where: { invoice_number: invoiceNumber },
    })
    if (!exists) return invoiceNumber
    nextNumber += 1
    invoiceNumber = `BUF-${year}-${String(nextNumber).padStart(4, '0')}`
    attempts += 1
  }

  throw new Error('No se pudo generar un número de factura único')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const id = req.query.id
    if (typeof id !== 'string' || !id) {
      return res.status(400).json({ error: 'ID inválido' })
    }

    const period =
      typeof req.body?.period === 'string' && /^\d{4}-\d{2}$/.test(req.body.period)
        ? req.body.period
        : new Date().toISOString().slice(0, 7)

    const recurringResult = await query<{
      id: string
      name: string
      source_invoice_id: number
      issue_day: number
      due_day: number | null
      is_active: boolean
      last_generated_period: string | null
    }>(
      `SELECT id, name, source_invoice_id, issue_day, due_day, is_active, last_generated_period
         FROM recurring_invoices
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1`,
      [id]
    )

    const recurring = recurringResult.rows[0]
    if (!recurring) {
      return res.status(404).json({ error: 'Factura recurrente no encontrada' })
    }
    if (!recurring.is_active) {
      return res.status(400).json({ error: 'La plantilla recurrente está desactivada' })
    }
    if (recurring.last_generated_period === period) {
      return res.status(400).json({ error: 'Esta plantilla ya generó la factura de este mes' })
    }

    const sourceInvoice = await prisma.invoice.findUnique({
      where: { id: recurring.source_invoice_id, deleted_at: null },
    })

    if (!sourceInvoice) {
      return res.status(404).json({ error: 'La factura base ya no existe' })
    }

    const [yearStr, monthStr] = period.split('-')
    const year = parseInt(yearStr, 10)
    const monthIndex = parseInt(monthStr, 10) - 1
    const issueDay = Math.min(recurring.issue_day, daysInMonth(year, monthIndex))
    const dueDay =
      recurring.due_day == null ? null : Math.min(recurring.due_day, daysInMonth(year, monthIndex))

    const issueDate = new Date(Date.UTC(year, monthIndex, issueDay))
    const dueDate = dueDay == null ? null : new Date(Date.UTC(year, monthIndex, dueDay))
    const invoiceNumber = await getNextInvoiceNumber()

    const created = await prisma.invoice.create({
      data: {
        invoice_number: invoiceNumber,
        client_name: sourceInvoice.client_name,
        client_company_name: sourceInvoice.client_company_name,
        client_email: sourceInvoice.client_email,
        client_address: sourceInvoice.client_address,
        client_tax_id: sourceInvoice.client_tax_id,
        company_name: sourceInvoice.company_name,
        company_address: sourceInvoice.company_address,
        issue_date: issueDate,
        due_date: dueDate,
        services: sourceInvoice.services as any,
        subtotal: sourceInvoice.subtotal,
        iva: sourceInvoice.iva,
        total: sourceInvoice.total,
        status: 'draft',
      },
    })

    await query(
      `UPDATE recurring_invoices
          SET last_generated_at = NOW(),
              last_generated_period = $2,
              last_generated_invoice_id = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [id, period, created.id]
    )

    return res.status(201).json({
      id: created.id,
      invoice_number: created.invoice_number,
      issue_date: created.issue_date.toISOString(),
    })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }

    console.error('Generate recurring invoice API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
