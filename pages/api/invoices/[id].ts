import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { z } from 'zod'
import {
  ensureInvoiceNumberAvailable,
  hardDeleteInvoice,
} from '@/lib/invoices/numbers'
import {
  asDocumentType,
  countsInFiscalTotals,
  isIssuedStatus,
  normalizeInvoiceDocument,
  numberMatchesDocumentType,
} from '@/lib/invoices/document'
import { rectificationTargetError } from '@/lib/invoices/rectification'

const invoiceUpdateSchema = z.object({
  invoice_number: z.string().min(1).optional(),
  client_name: z.string().min(1).optional(),
  client_company_name: z.string().optional(),
  client_email: z.string().email().optional().or(z.literal('')),
  client_address: z.string().optional(),
  client_tax_id: z.string().optional(),
  company_name: z.string().optional(),
  company_address: z.string().optional(),
  issue_date: z.string().optional(),
  due_date: z.string().optional(),
  services: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number(),
    price: z.number(),
    tax: z.number().min(0).max(100).default(21),
    total: z.number().optional(),
  })).optional(),
  subtotal: z.number().optional(),
  iva: z.number().optional(),
  total: z.number().optional(),
  status: z.enum(['draft', 'sent', 'cancelled']).optional(),
  bank_transaction_id: z.string().uuid().nullable().optional(),
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

    const id = parseInt(req.query.id as string)

    if (req.method === 'GET') {
      const invoice = await prisma.invoice.findUnique({
        where: { id, deleted_at: null },
      })

      if (!invoice) {
        return res.status(404).json({ error: 'Factura no encontrada' })
      }

      return res.status(200).json({
        ...invoice,
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

    if (req.method === 'PUT') {
      const invoice = await prisma.invoice.findUnique({
        where: { id, deleted_at: null },
      })

      if (!invoice) {
        return res.status(404).json({ error: 'Factura no encontrada' })
      }

      const data = invoiceUpdateSchema.parse(req.body)
      const bodyKeys = Object.keys(req.body || {})
      const bankLinkOnly =
        bodyKeys.length > 0 && bodyKeys.every((key) => key === 'bank_transaction_id')

      if (isIssuedStatus(invoice.status) && !bankLinkOnly) {
        return res.status(409).json({
          error:
            'Esta factura ya está emitida y no se modifica. El original se conserva. Si hay que corregirla, crea una factura rectificativa.',
        })
      }

      if (!bankLinkOnly && data.services) {
        const normalized = normalizeInvoiceDocument({
          document_type: data.document_type || invoice.document_type,
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
          status: data.status || (invoice.status as 'draft' | 'sent' | 'cancelled'),
        })
        if (!normalized.ok) {
          return res.status(400).json({ error: normalized.error })
        }
        if (normalized.value.rectifies_invoice_id != null) {
          const targetError = await rectificationTargetError(normalized.value.rectifies_invoice_id, id)
          if (targetError) return res.status(400).json({ error: targetError })
        }
        const nextNumber = data.invoice_number || invoice.invoice_number
        if (!numberMatchesDocumentType(nextNumber, normalized.value.document_type)) {
          return res.status(400).json({
            error: 'El número no corresponde a la serie de este documento.',
          })
        }
        data.services = normalized.value.services
        data.subtotal = normalized.value.subtotal
        data.iva = normalized.value.iva
        data.total = normalized.value.total
        data.document_type = normalized.value.document_type
        data.document_title = normalized.value.document_title
        data.observations = normalized.value.observations
        data.rectifies_invoice_id = normalized.value.rectifies_invoice_id
        data.rectification_reason = normalized.value.rectification_reason
        data.show_payment_info = normalized.value.show_payment_info
        data.payment_method = normalized.value.payment_method
        data.bank_name = normalized.value.bank_name
        data.bank_account_holder = normalized.value.bank_account_holder
        data.iban = normalized.value.iban
        data.payment_instructions = normalized.value.payment_instructions
        data.status = normalized.value.status
      }

      if (data.invoice_number !== undefined && data.invoice_number !== invoice.invoice_number) {
        const availability = await ensureInvoiceNumberAvailable(data.invoice_number, id)
        if (!availability.ok) {
          return res.status(400).json({ error: 'El número de factura ya existe' })
        }
      }

      const updateData: any = {}
      if (data.invoice_number !== undefined) updateData.invoice_number = data.invoice_number
      if (data.client_name !== undefined) updateData.client_name = data.client_name
      if (data.client_company_name !== undefined) updateData.client_company_name = data.client_company_name
      if (data.client_email !== undefined) updateData.client_email = data.client_email || null
      if (data.client_address !== undefined) updateData.client_address = data.client_address
      if (data.client_tax_id !== undefined) updateData.client_tax_id = data.client_tax_id
      if (data.company_name !== undefined) updateData.company_name = data.company_name
      if (data.company_address !== undefined) updateData.company_address = data.company_address
      if (data.issue_date !== undefined) updateData.issue_date = new Date(data.issue_date)
      if (data.due_date !== undefined) updateData.due_date = data.due_date ? new Date(data.due_date) : null
      if (data.services !== undefined) updateData.services = data.services as any
      if (data.subtotal !== undefined) updateData.subtotal = data.subtotal
      if (data.iva !== undefined) updateData.iva = data.iva
      if (data.total !== undefined) updateData.total = data.total
      if (data.status !== undefined) updateData.status = data.status
      if (data.document_type !== undefined) updateData.document_type = data.document_type
      if (data.document_title !== undefined) updateData.document_title = data.document_title
      if (data.observations !== undefined) updateData.observations = data.observations
      if (data.rectifies_invoice_id !== undefined) updateData.rectifies_invoice_id = data.rectifies_invoice_id
      if (data.rectification_reason !== undefined) updateData.rectification_reason = data.rectification_reason
      if (data.show_payment_info !== undefined) updateData.show_payment_info = data.show_payment_info
      if (data.payment_method !== undefined) updateData.payment_method = data.payment_method
      if (data.bank_name !== undefined) updateData.bank_name = data.bank_name
      if (data.bank_account_holder !== undefined) updateData.bank_account_holder = data.bank_account_holder
      if (data.iban !== undefined) updateData.iban = data.iban
      if (data.payment_instructions !== undefined) updateData.payment_instructions = data.payment_instructions

      if (data.bank_transaction_id !== undefined) {
        if (data.bank_transaction_id) {
          await query(
            `UPDATE invoices SET bank_transaction_id = NULL WHERE bank_transaction_id = $1 AND id != $2`,
            [data.bank_transaction_id, id]
          )
        }
        await query(
          `UPDATE invoices SET bank_transaction_id = $1, updated_at = NOW() WHERE id = $2`,
          [data.bank_transaction_id, id]
        )
      }

      const updated = Object.keys(updateData).length > 0
        ? await prisma.invoice.update({
            where: { id },
            data: updateData,
          })
        : await prisma.invoice.findUnique({
            where: { id, deleted_at: null },
          })

      if (!updated) {
        return res.status(404).json({ error: 'Factura no encontrada' })
      }

      const savedType = asDocumentType(updateData.document_type || invoice.document_type)
      if (data.status === 'sent' && countsInFiscalTotals(savedType)) {
        const { scheduleAnnualGoalCheck } = await import('@/lib/finance/annual-target-alert')
        scheduleAnnualGoalCheck()
      }

      // Marcar enviada → FACTURA EMITIDA en embudo global. Solo una factura normal.
      if (data.status === 'sent' && invoice.status !== 'sent' && (updateData.document_type || invoice.document_type) === 'invoice') {
        try {
          const { advanceLeadOnGlobalByContactEmail } = await import(
            '@/lib/pipelines/onboarding-global'
          )
          const email = updated.client_email || invoice.client_email
          if (email) {
            await advanceLeadOnGlobalByContactEmail(email, 'enviar_factura')
          }
        } catch (e) {
          console.error('[invoices] pipeline FACTURA EMITIDA', e)
        }
      }

      return res.status(200).json({
        ...updated,
        subtotal: Number(updated.subtotal),
        iva: Number(updated.iva),
        total: Number(updated.total),
        issue_date: updated.issue_date.toISOString(),
        due_date: updated.due_date?.toISOString() || null,
        created_at: updated.created_at.toISOString(),
        updated_at: updated.updated_at.toISOString(),
        deleted_at: updated.deleted_at?.toISOString() || null,
      })
    }

    if (req.method === 'DELETE') {
      // Solo facturas activas (no leftovers soft-deleted)
      const invoice = await prisma.invoice.findUnique({
        where: { id, deleted_at: null },
      })

      if (!invoice) {
        return res.status(404).json({ error: 'Factura no encontrada' })
      }

      if (invoice.status !== 'draft') {
        return res.status(409).json({
          error:
            'No se elimina una factura ya emitida. Se conserva tal cual. Si hay que anularla, crea una factura rectificativa.',
        })
      }

      const rectificationCount = await prisma.invoice.count({
        where: { rectifies_invoice_id: id, deleted_at: null },
      })
      if (rectificationCount > 0) {
        return res.status(409).json({
          error: 'Esta factura tiene rectificativas y no se elimina.',
        })
      }

      const result = await hardDeleteInvoice(id)
      if (!result.deleted) {
        return res.status(500).json({ error: 'No se pudo eliminar la factura por completo' })
      }

      return res.status(200).json({
        success: true,
        deleted: true,
        invoice_number: result.invoice_number,
        hard_delete: true,
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

    console.error('Invoice API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

