import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  ensureInvoiceNumberAvailable,
  getNextDocumentNumber,
} from '@/lib/invoices/numbers'
import {
  countsInFiscalTotals,
  normalizeInvoiceDocument,
  numberMatchesDocumentType,
} from '@/lib/invoices/document'
import { rectificationTargetError } from '@/lib/invoices/rectification'

const serviceSchema = z.object({
  description: z.string().min(1, 'La descripción es requerida'),
  quantity: z.number(),
  price: z.number(),
  tax: z.number().min(0).max(100).default(21),
  total: z.number().optional(),
})

const invoiceSchema = z.object({
  invoice_number: z.string().min(1).optional(),
  client_name: z.string().min(1, 'El nombre del cliente es requerido'),
  client_company_name: z.string().optional(),
  client_email: z.string().email('Email inválido').optional().or(z.literal('')),
  client_address: z.string().optional(),
  client_tax_id: z.string().optional(),
  company_name: z.string().optional(),
  company_address: z.string().optional(),
  issue_date: z.string().optional(),
  due_date: z.string().optional(),
  services: z.array(serviceSchema).min(1, 'Debe haber al menos un servicio'),
  subtotal: z.number().optional(),
  iva: z.number().optional(),
  total: z.number().optional(),
  status: z.enum(['draft', 'sent', 'cancelled']).optional(),
  /** Si viene de onboarding, se trackea la factura al lead */
  lead_id: z.number().int().positive().optional().nullable(),
  document_type: z.enum(['invoice', 'credit_note', 'proforma', 'quote']).optional(),
  document_title: z.string().max(80).optional().nullable(),
  observations: z.string().max(4000).optional().nullable(),
  rectifies_invoice_id: z.number().int().positive().optional().nullable(),
  rectification_reason: z.string().max(2000).optional().nullable(),
  show_payment_info: z.boolean().optional(),
  payment_method: z.string().max(200).optional().nullable(),
  bank_name: z.string().max(200).optional().nullable(),
  bank_account_holder: z.string().max(200).optional().nullable(),
  iban: z.string().max(64).optional().nullable(),
  payment_instructions: z.string().max(2000).optional().nullable(),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requireAuthAPI(req, res)

    if (req.method === 'GET') {
      const page = parseInt(req.query.page as string) || 1
      const status = (req.query.status as string) || ''
      const search = (req.query.search as string) || ''
      const leadIdRaw = req.query.lead_id as string | undefined
      const leadId = leadIdRaw ? parseInt(leadIdRaw, 10) : NaN
      const pageSize = leadIdRaw ? 50 : 10
      const skip = (page - 1) * pageSize

      const where: any = {
        deleted_at: null,
      }

      if (Number.isFinite(leadId) && leadId > 0) {
        // Raw por si el client Prisma aún no tiene lead_id regenerado
        const rows = await prisma.$queryRaw<
          Array<{
            id: number
            invoice_number: string
            client_name: string
            status: string
            subtotal: unknown
            iva: unknown
            total: unknown
            issue_date: Date
            due_date: Date | null
            created_at: Date
            updated_at: Date
            deleted_at: Date | null
            lead_id: number | null
          }>
        >`
          SELECT id, invoice_number, client_name, status,
                 subtotal, iva, total, issue_date, due_date,
                 created_at, updated_at, deleted_at, lead_id
          FROM invoices
          WHERE deleted_at IS NULL AND lead_id = ${leadId}
          ORDER BY issue_date DESC
          LIMIT ${pageSize}
        `
        return res.status(200).json({
          invoices: rows.map((inv) => ({
            ...inv,
            subtotal: Number(inv.subtotal),
            iva: Number(inv.iva),
            total: Number(inv.total),
            issue_date: inv.issue_date.toISOString(),
            due_date: inv.due_date?.toISOString() || null,
            created_at: inv.created_at.toISOString(),
            updated_at: inv.updated_at.toISOString(),
            deleted_at: inv.deleted_at?.toISOString() || null,
          })),
          pagination: {
            page: 1,
            pageSize,
            total: rows.length,
            totalPages: 1,
          },
        })
      }

      if (status && status !== 'all') {
        where.status = status
      }

      if (search) {
        where.OR = [
          { invoice_number: { contains: search, mode: 'insensitive' } },
          { client_name: { contains: search, mode: 'insensitive' } },
          { client_email: { contains: search, mode: 'insensitive' } },
        ]
      }

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { issue_date: 'desc' },
        }),
        prisma.invoice.count({ where }),
      ])

      return res.status(200).json({
        invoices: invoices.map((inv) => ({
          ...inv,
          lead_id: (inv as { lead_id?: number | null }).lead_id ?? null,
          subtotal: Number(inv.subtotal),
          iva: Number(inv.iva),
          total: Number(inv.total),
          issue_date: inv.issue_date.toISOString(),
          due_date: inv.due_date?.toISOString() || null,
          created_at: inv.created_at.toISOString(),
          updated_at: inv.updated_at.toISOString(),
          deleted_at: inv.deleted_at?.toISOString() || null,
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      })
    }

    if (req.method === 'POST') {
      const data = invoiceSchema.parse(req.body)
      const normalized = normalizeInvoiceDocument({
        document_type: data.document_type,
        document_title: data.document_title,
        observations: data.observations,
        rectifies_invoice_id: data.rectifies_invoice_id,
        rectification_reason: data.rectification_reason,
        show_payment_info: data.show_payment_info,
        payment_method: data.payment_method,
        bank_name: data.bank_name,
        bank_account_holder: data.bank_account_holder,
        iban: data.iban,
        payment_instructions: data.payment_instructions,
        services: data.services,
        status: data.status,
      })
      if (!normalized.ok) {
        return res.status(400).json({ error: normalized.error })
      }

      if (normalized.value.rectifies_invoice_id != null) {
        const targetError = await rectificationTargetError(normalized.value.rectifies_invoice_id)
        if (targetError) {
          return res.status(400).json({ error: targetError })
        }
      }

      const documentType = normalized.value.document_type
      let invoiceNumber = data.invoice_number

      if (!invoiceNumber) {
        invoiceNumber = await getNextDocumentNumber(documentType)
      } else if (!numberMatchesDocumentType(invoiceNumber, documentType)) {
        return res.status(400).json({
          error: 'El número no corresponde a la serie de este documento. La numeración ya emitida no se reutiliza.',
        })
      } else {
        const availability = await ensureInvoiceNumberAvailable(invoiceNumber)
        if (!availability.ok) {
          return res.status(400).json({ error: 'El número de factura ya existe' })
        }
      }

      const status = normalized.value.status

      let leadId: number | null = data.lead_id ?? null
      if (leadId != null) {
        const leadExists = await prisma.lead.findUnique({
          where: { id: leadId },
          select: { id: true },
        })
        if (!leadExists) leadId = null
      }

      // Crear factura (reintenta si unique choca con leftover soft-deleted)
      let invoice
      try {
        const availability = await ensureInvoiceNumberAvailable(invoiceNumber)
        if (!availability.ok) {
          return res.status(400).json({ error: 'El número de factura ya existe' })
        }
        invoice = await prisma.invoice.create({
          data: {
            invoice_number: invoiceNumber,
            client_name: data.client_name,
            client_company_name: data.client_company_name || null,
            client_email: data.client_email || null,
            client_address: data.client_address || null,
            client_tax_id: data.client_tax_id || null,
            company_name: data.company_name || 'BUFFALO AI',
            company_address: data.company_address || null,
            issue_date: data.issue_date ? new Date(data.issue_date) : new Date(),
            due_date: data.due_date ? new Date(data.due_date) : null,
            services: normalized.value.services as any,
            subtotal: normalized.value.subtotal,
            iva: normalized.value.iva,
            total: normalized.value.total,
            status,
            document_type: normalized.value.document_type,
            document_title: normalized.value.document_title,
            observations: normalized.value.observations,
            rectifies_invoice_id: normalized.value.rectifies_invoice_id,
            rectification_reason: normalized.value.rectification_reason,
            show_payment_info: normalized.value.show_payment_info,
            payment_method: normalized.value.payment_method,
            bank_name: normalized.value.bank_name,
            bank_account_holder: normalized.value.bank_account_holder,
            iban: normalized.value.iban,
            payment_instructions: normalized.value.payment_instructions,
          },
        })
      } catch (createErr: unknown) {
        const code =
          createErr && typeof createErr === 'object' && 'code' in createErr
            ? String((createErr as { code?: string }).code)
            : ''
        if (code !== 'P2002') throw createErr
        // Unique constraint: tomar el siguiente libre
        invoiceNumber = await getNextDocumentNumber(documentType)
        invoice = await prisma.invoice.create({
          data: {
            invoice_number: invoiceNumber,
            client_name: data.client_name,
            client_company_name: data.client_company_name || null,
            client_email: data.client_email || null,
            client_address: data.client_address || null,
            client_tax_id: data.client_tax_id || null,
            company_name: data.company_name || 'BUFFALO AI',
            company_address: data.company_address || null,
            issue_date: data.issue_date ? new Date(data.issue_date) : new Date(),
            due_date: data.due_date ? new Date(data.due_date) : null,
            services: normalized.value.services as any,
            subtotal: normalized.value.subtotal,
            iva: normalized.value.iva,
            total: normalized.value.total,
            status,
            document_type: normalized.value.document_type,
            document_title: normalized.value.document_title,
            observations: normalized.value.observations,
            rectifies_invoice_id: normalized.value.rectifies_invoice_id,
            rectification_reason: normalized.value.rectification_reason,
            show_payment_info: normalized.value.show_payment_info,
            payment_method: normalized.value.payment_method,
            bank_name: normalized.value.bank_name,
            bank_account_holder: normalized.value.bank_account_holder,
            iban: normalized.value.iban,
            payment_instructions: normalized.value.payment_instructions,
          },
        })
      }

      if (leadId != null) {
        try {
          await prisma.$executeRaw`
            UPDATE invoices SET lead_id = ${leadId} WHERE id = ${invoice.id}
          `
        } catch (e) {
          console.error('[invoices] set lead_id', e)
        }
      }

      if (status === 'sent' && countsInFiscalTotals(documentType)) {
        const { scheduleAnnualGoalCheck } = await import('@/lib/finance/annual-target-alert')
        scheduleAnnualGoalCheck()
      }

      if (status === 'sent' && documentType === 'invoice' && invoice.client_email) {
        try {
          const { advanceLeadOnGlobalByContactEmail } = await import(
            '@/lib/pipelines/onboarding-global'
          )
          await advanceLeadOnGlobalByContactEmail(invoice.client_email, 'enviar_factura')
        } catch (e) {
          console.error('[invoices] pipeline FACTURA EMITIDA', e)
        }
      }

      return res.status(201).json({
        ...invoice,
        lead_id: leadId,
        subtotal: Number(invoice.subtotal),
        iva: Number(invoice.iva),
        total: Number(invoice.total),
        issue_date: invoice.issue_date.toISOString(),
        due_date: invoice.due_date?.toISOString() || null,
        created_at: invoice.created_at.toISOString(),
        updated_at: invoice.updated_at.toISOString(),
        deleted_at: invoice.deleted_at?.toISOString() || null,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }

    if (error instanceof Error && (error.message === 'No session' || error.message === 'Invalid session' || error.message === 'Expired session')) {
      return // Ya se envió la respuesta 401
    }

    console.error('Invoices API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

