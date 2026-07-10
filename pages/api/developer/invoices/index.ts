import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireFreelancerInvoicesAPI } from '@/lib/auth'
import {
  createDeveloperInvoice,
  DeveloperInvoicesConfigError,
  listDeveloperInvoices,
  nextDeveloperInvoiceNumber,
} from '@/lib/developer/invoices'

const serviceSchema = z.object({
  description: z.string().min(1),
  quantity: z.number(),
  price: z.number(),
  tax: z.number().min(0).max(100).default(21),
  total: z.number(),
})

const createSchema = z.object({
  services: z.array(serviceSchema).min(1),
  subtotal: z.number().min(0),
  iva: z.number().min(0),
  total: z.number().positive(),
  issue_date: z.string().optional(),
  status: z.enum(['draft', 'sent']).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireFreelancerInvoicesAPI(req, res)
  } catch {
    return
  }

  if (req.method === 'GET') {
    try {
      const invoices = await listDeveloperInvoices(user.id)
      const nextNumber = await nextDeveloperInvoiceNumber(user.id)
      return res.status(200).json({
        invoices: invoices.map((inv) => ({
          ...inv,
          issue_date: inv.issue_date.toISOString(),
          created_at: inv.created_at.toISOString(),
          has_pdf: inv.has_pdf,
        })),
        next_invoice_number: nextNumber,
      })
    } catch (error) {
      if (error instanceof DeveloperInvoicesConfigError) {
        return res.status(503).json({ error: error.message, hint: error.message })
      }
      console.error('[developer/invoices GET]', error)
      return res.status(500).json({ error: 'Error al cargar facturas' })
    }
  }

  if (req.method === 'POST') {
    try {
      const data = createSchema.parse(req.body)
      const invoiceNumber = await nextDeveloperInvoiceNumber(user.id)
      const id = await createDeveloperInvoice(user.id, {
        invoice_number: invoiceNumber,
        services: data.services,
        subtotal: data.subtotal,
        iva: data.iva,
        total: data.total,
        issue_date: data.issue_date,
        status: data.status || 'draft',
      })
      if (!id) {
        return res.status(500).json({
          error: 'No se pudo crear la factura',
          hint: 'Ejecuta prisma/ALTER_INVOICES_DEVELOPER.sql',
        })
      }
      return res.status(201).json({ id, invoice_number: invoiceNumber })
    } catch (error) {
      if (error instanceof DeveloperInvoicesConfigError) {
        return res.status(503).json({ error: 'Migración pendiente', hint: error.message })
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
      }
      console.error('[developer/invoices POST]', error)
      return res.status(500).json({ error: 'Error al crear factura' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
