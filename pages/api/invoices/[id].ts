import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const invoiceUpdateSchema = z.object({
  client_name: z.string().min(1).optional(),
  client_email: z.string().email().optional().or(z.literal('')),
  client_address: z.string().optional(),
  client_tax_id: z.string().optional(),
  issue_date: z.string().optional(),
  due_date: z.string().optional(),
  services: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    price: z.number().positive(),
    tax: z.number().min(0).max(100).default(21),
    total: z.number().positive(),
  })).optional(),
  subtotal: z.number().min(0).optional(),
  iva: z.number().min(0).optional(),
  total: z.number().positive().optional(),
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

      // Solo se puede editar si está en draft
      if (invoice.status !== 'draft') {
        return res.status(400).json({ error: 'Solo se pueden editar facturas en borrador' })
      }

      const data = invoiceUpdateSchema.parse(req.body)

      const updateData: any = {}
      if (data.client_name !== undefined) updateData.client_name = data.client_name
      if (data.client_email !== undefined) updateData.client_email = data.client_email || null
      if (data.client_address !== undefined) updateData.client_address = data.client_address
      if (data.client_tax_id !== undefined) updateData.client_tax_id = data.client_tax_id
      if (data.issue_date !== undefined) updateData.issue_date = new Date(data.issue_date)
      if (data.due_date !== undefined) updateData.due_date = data.due_date ? new Date(data.due_date) : null
      if (data.services !== undefined) updateData.services = data.services as any
      if (data.subtotal !== undefined) updateData.subtotal = data.subtotal
      if (data.iva !== undefined) updateData.iva = data.iva
      if (data.total !== undefined) updateData.total = data.total

      const updated = await prisma.invoice.update({
        where: { id },
        data: updateData,
      })

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
      const invoice = await prisma.invoice.findUnique({
        where: { id, deleted_at: null },
      })

      if (!invoice) {
        return res.status(404).json({ error: 'Factura no encontrada' })
      }

      // Soft delete
      await prisma.invoice.update({
        where: { id },
        data: { deleted_at: new Date() },
      })

      return res.status(200).json({ success: true })
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

