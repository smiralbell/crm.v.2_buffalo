import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const serviceSchema = z.object({
  description: z.string().min(1, 'La descripción es requerida'),
  quantity: z.number().positive('La cantidad debe ser positiva'),
  price: z.number().positive('El precio debe ser positivo'),
  tax: z.number().min(0).max(100).default(21),
  total: z.number().positive(),
})

const invoiceSchema = z.object({
  client_name: z.string().min(1, 'El nombre del cliente es requerido'),
  client_email: z.string().email('Email inválido').optional().or(z.literal('')),
  client_address: z.string().optional(),
  client_tax_id: z.string().optional(),
  issue_date: z.string().optional(),
  due_date: z.string().optional(),
  services: z.array(serviceSchema).min(1, 'Debe haber al menos un servicio'),
  subtotal: z.number().min(0),
  iva: z.number().min(0),
  total: z.number().positive(),
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
      const pageSize = 10
      const skip = (page - 1) * pageSize

      const where: any = {
        deleted_at: null,
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

      // Generar número de factura (BUF-YYYY-NNNN)
      const year = new Date().getFullYear()
      
      // Buscar el último número de factura del año actual (incluyendo eliminadas para evitar duplicados)
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
          const lastNum = parseInt(parts[2] || '0')
          if (!isNaN(lastNum)) {
            nextNumber = lastNum + 1
          }
        }
      }

      // Verificar que el número no exista (por si acaso)
      let invoiceNumber = `BUF-${year}-${String(nextNumber).padStart(4, '0')}`
      let attempts = 0
      while (attempts < 100) {
        const exists = await prisma.invoice.findUnique({
          where: { invoice_number: invoiceNumber },
        })
        if (!exists) break
        nextNumber++
        invoiceNumber = `BUF-${year}-${String(nextNumber).padStart(4, '0')}`
        attempts++
      }

      // Crear factura
      const invoice = await prisma.invoice.create({
        data: {
          invoice_number: invoiceNumber,
          client_name: data.client_name,
          client_email: data.client_email || null,
          client_address: data.client_address || null,
          client_tax_id: data.client_tax_id || null,
          issue_date: data.issue_date ? new Date(data.issue_date) : new Date(),
          due_date: data.due_date ? new Date(data.due_date) : null,
          services: data.services as any,
          subtotal: data.subtotal,
          iva: data.iva,
          total: data.total,
          status: 'draft',
        },
      })

      return res.status(201).json({
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

