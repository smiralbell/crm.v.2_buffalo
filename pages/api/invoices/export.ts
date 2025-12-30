import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requireAuthAPI(req, res)

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { ids, status, dateFrom, dateTo } = req.query

    const where: any = {
      deleted_at: null,
    }

    // Si hay IDs específicos, filtrar por ellos
    if (ids && typeof ids === 'string') {
      const invoiceIds = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
      if (invoiceIds.length > 0) {
        where.id = { in: invoiceIds }
      }
    } else if (status && status !== 'all') {
      // Si hay filtro por estado
      where.status = status
    }

    // Filtro por fechas
    if (dateFrom || dateTo) {
      where.issue_date = {}
      if (dateFrom) {
        where.issue_date.gte = new Date(dateFrom as string)
      }
      if (dateTo) {
        // Añadir un día completo para incluir el día final
        const endDate = new Date(dateTo as string)
        endDate.setHours(23, 59, 59, 999)
        where.issue_date.lte = endDate
      }
    }

    // Obtener todas las facturas con todos sus datos
    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: {
        issue_date: 'desc',
      },
    })

    // Convertir Decimal a Number y Date a string
    const formattedInvoices = invoices.map(invoice => ({
      ...invoice,
      subtotal: Number(invoice.subtotal),
      iva: Number(invoice.iva),
      total: Number(invoice.total),
      issue_date: invoice.issue_date.toISOString(),
      due_date: invoice.due_date?.toISOString() || null,
      created_at: invoice.created_at.toISOString(),
      updated_at: invoice.updated_at.toISOString(),
      deleted_at: invoice.deleted_at?.toISOString() || null,
      services: invoice.services as any,
    }))

    return res.status(200).json({
      invoices: formattedInvoices,
      count: formattedInvoices.length,
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'No session' || error.message === 'Invalid session' || error.message === 'Expired session')) {
      return // Ya se envió la respuesta 401
    }

    console.error('Export invoices API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

