import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import { mergeLeadConfig } from '@/lib/onboarding/project-context-ai'

type LinkedInvoice = {
  id: number
  invoice_number: string
  total: number
  status: string
  linked_at: string
}

const createSchema = z.object({
  /** Si true, crea factura solo con el setup. Si false, setup + mensualidad (si hay). */
  include_monthly: z.boolean().optional().default(false),
  /** Porcentaje del setup a facturar ahora (50 = primer pago). Default 100. */
  setup_percent: z.number().min(1).max(100).optional().default(100),
})

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const lastInvoice = await prisma.invoice.findFirst({
    where: { invoice_number: { startsWith: `BUF-${year}-` } },
    orderBy: { invoice_number: 'desc' },
  })
  let nextNumber = 1
  if (lastInvoice) {
    const parts = lastInvoice.invoice_number.split('-')
    const lastNum = parseInt(parts[2] || '0', 10)
    if (!Number.isNaN(lastNum)) nextNumber = lastNum + 1
  }
  let invoiceNumber = `BUF-${year}-${String(nextNumber).padStart(4, '0')}`
  for (let i = 0; i < 50; i++) {
    const exists = await prisma.invoice.findUnique({ where: { invoice_number: invoiceNumber } })
    if (!exists) return invoiceNumber
    nextNumber++
    invoiceNumber = `BUF-${year}-${String(nextNumber).padStart(4, '0')}`
  }
  return invoiceNumber
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)

    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' })
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: {
          select: {
            nombre: true,
            email: true,
            empresa: true,
            direccion_fiscal: true,
            cif: true,
          },
        },
      },
    })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const cfg = parseConfiguradorConfig(lead.configuracion)
    const linked = (cfg?.linked_invoices || []) as LinkedInvoice[]

    if (req.method === 'GET') {
      // Refresh status/totals from DB for linked ids
      const ids = linked.map((x) => x.id)
      const fresh =
        ids.length > 0
          ? await prisma.invoice.findMany({
              where: { id: { in: ids }, deleted_at: null },
              orderBy: { created_at: 'desc' },
            })
          : []
      const byId = new Map(fresh.map((inv) => [inv.id, inv]))
      const invoices = linked
        .map((l) => {
          const inv = byId.get(l.id)
          if (!inv) return null
          return {
            id: inv.id,
            invoice_number: inv.invoice_number,
            total: Number(inv.total),
            status: inv.status,
            linked_at: l.linked_at,
            issue_date: inv.issue_date.toISOString(),
          }
        })
        .filter(Boolean)

      return res.status(200).json({ ok: true, invoices })
    }

    if (req.method === 'POST') {
      const body = createSchema.parse(req.body ?? {})
      const proyectoRows = await prisma.$queryRaw<
        { name: string; setup_fee_eur: number | null; monthly_fee_eur: number | null }[]
      >`
        SELECT name,
               setup_fee_eur::float8 AS setup_fee_eur,
               monthly_fee_eur::float8 AS monthly_fee_eur
        FROM proyectos
        WHERE lead_id = ${leadId}
        LIMIT 1
      `
      const p = proyectoRows[0]
      const setup =
        p?.setup_fee_eur != null && p.setup_fee_eur > 0
          ? p.setup_fee_eur
          : lead.valor != null
            ? Number(lead.valor)
            : 0
      const monthly =
        p?.monthly_fee_eur != null && p.monthly_fee_eur > 0 ? p.monthly_fee_eur : 0

      if (setup <= 0 && (!body.include_monthly || monthly <= 0)) {
        return res.status(400).json({
          error: 'No hay importe de setup/mensualidad para facturar. Edita el proyecto primero.',
        })
      }

      const projectName = p?.name || cfg?.title || 'Proyecto Buffalo'
      const setupAmount = Math.round((setup * (body.setup_percent || 100)) / 100)
      const services: Array<{
        description: string
        quantity: number
        price: number
        tax: number
        total: number
      }> = []

      if (setupAmount > 0) {
        const label =
          body.setup_percent < 100
            ? `${projectName} — Setup (${body.setup_percent}%)`
            : `${projectName} — Setup`
        services.push({
          description: label,
          quantity: 1,
          price: setupAmount,
          tax: 21,
          total: setupAmount,
        })
      }
      if (body.include_monthly && monthly > 0) {
        services.push({
          description: `${projectName} — Mensualidad`,
          quantity: 1,
          price: monthly,
          tax: 21,
          total: monthly,
        })
      }

      const subtotal = services.reduce((s, x) => s + x.total, 0)
      const iva = Math.round(subtotal * 0.21 * 100) / 100
      const total = Math.round((subtotal + iva) * 100) / 100

      const invoiceNumber = await nextInvoiceNumber()
      const contact = lead.contact
      const invoice = await prisma.invoice.create({
        data: {
          invoice_number: invoiceNumber,
          client_name: contact?.nombre || contact?.empresa || 'Cliente',
          client_company_name: contact?.empresa || null,
          client_email: contact?.email || null,
          client_address: contact?.direccion_fiscal || null,
          client_tax_id: contact?.cif || null,
          company_name: 'BUFFALO AI',
          issue_date: new Date(),
          services: services as object,
          subtotal,
          iva,
          total,
          status: 'draft',
        },
      })

      const entry: LinkedInvoice = {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        total: Number(invoice.total),
        status: invoice.status,
        linked_at: new Date().toISOString(),
      }
      const nextLinked = [entry, ...linked.filter((x) => x.id !== invoice.id)]
      const { encoded } = mergeLeadConfig(lead.configuracion, {
        linked_invoices: nextLinked,
      })
      await prisma.lead.update({
        where: { id: leadId },
        data: { configuracion: encoded },
      })

      return res.status(201).json({
        ok: true,
        invoice: {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          total: Number(invoice.total),
          status: invoice.status,
          edit_url: `/invoices/${invoice.id}/edit`,
        },
        invoices: nextLinked,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }
    console.error('[onboarding/projects/invoice]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error con facturas del onboarding',
    })
  }
}
