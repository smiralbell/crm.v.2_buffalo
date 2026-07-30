import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { applyLeadSetupFee } from '@/lib/crm/sync-lead-value'

const leadUpdateSchema = z.object({
  contact_id: z.number().optional(),
  estado: z.string().optional(),
  valor: z.number().optional().nullable(),
  origen_principal: z.string().optional().nullable(),
  prioridad: z.string().optional().nullable(),
  score: z.number().optional().nullable(),
  notas: z.string().optional().nullable(),
  configuracion: z.string().optional().nullable(),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requireAuthAPI(req, res)

    const id = parseInt(req.query.id as string)

    if (req.method === 'GET') {
      const lead = await prisma.lead.findUnique({
        where: { id },
        include: {
          contact: true,
        },
      })

      if (!lead) {
        return res.status(404).json({ error: 'Lead no encontrado' })
      }

      return res.status(200).json({
        ...lead,
        valor: lead.valor != null ? Number(lead.valor) : null,
      })
    }

    if (req.method === 'PUT') {
      const data = leadUpdateSchema.parse(req.body)

      const updateData: Record<string, unknown> = {}
      if (data.contact_id !== undefined) updateData.contact_id = data.contact_id
      if (data.estado !== undefined) updateData.estado = data.estado
      if (data.origen_principal !== undefined) updateData.origen_principal = data.origen_principal
      if (data.prioridad !== undefined) updateData.prioridad = data.prioridad
      if (data.score !== undefined) updateData.score = data.score
      if (data.notas !== undefined) updateData.notas = data.notas
      if (data.configuracion !== undefined) updateData.configuracion = data.configuracion

      // valor se sincroniza con proyectos + pipeline (mismo importe en todos lados)
      if (data.valor !== undefined) {
        await applyLeadSetupFee(id, data.valor)
      }

      const lead =
        Object.keys(updateData).length > 0
          ? await prisma.lead.update({
              where: { id },
              data: updateData,
            })
          : await prisma.lead.findUnique({ where: { id } })

      if (!lead) {
        return res.status(404).json({ error: 'Lead no encontrado' })
      }

      return res.status(200).json({
        ...lead,
        valor: lead.valor != null ? Number(lead.valor) : null,
      })
    }

    if (req.method === 'DELETE') {
      const lead = await prisma.lead.findUnique({
        where: { id },
        select: { id: true, contact_id: true },
      })
      if (!lead) {
        return res.status(404).json({ error: 'Lead no encontrado' })
      }

      const contactId = lead.contact_id
      const alsoContact =
        req.query.alsoContact !== '0' && req.query.also_contact !== '0'

      try {
        await prisma.$transaction(async (tx) => {
          // Desvincular proyecto de onboarding / gestión
          await tx.$executeRaw`
            UPDATE proyectos
            SET
              lead_id = NULL,
              es_buffalo = FALSE,
              status = CASE WHEN status = 'churned' THEN status ELSE 'churned' END,
              updated_at = NOW()
            WHERE lead_id = ${id}
          `

          if (alsoContact && contactId) {
            // Soft-delete tarjetas de pipeline del contacto
            await tx.pipelineCard.updateMany({
              where: {
                entity_id: String(contactId),
                deleted_at: null,
              },
              data: { deleted_at: new Date() },
            })
            // Borrar contacto → cascade messages/tasks/lead (1:1)
            await tx.contact.delete({ where: { id: contactId } })
          } else {
            await tx.lead.delete({ where: { id } })
          }
        })
      } catch (err) {
        // Fallback si proyectos/pipeline fallan: borrar lead (+ contacto si se pide)
        console.warn('[api/leads DELETE] transaction warn, fallback', err)
        if (alsoContact && contactId) {
          await prisma.contact.delete({ where: { id: contactId } }).catch(async () => {
            await prisma.lead.delete({ where: { id } })
          })
        } else {
          await prisma.lead.delete({ where: { id } })
        }
      }

      return res.status(200).json({ success: true, deleted_contact: alsoContact })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }

    if (error instanceof Error && (error.message === 'No session' || error.message === 'Invalid session' || error.message === 'Expired session')) {
      return // Ya se envió la respuesta 401
    }

    console.error('Lead API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

