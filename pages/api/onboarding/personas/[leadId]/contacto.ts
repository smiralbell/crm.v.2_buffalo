import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireLeadAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { prisma } from '@/lib/prisma'
import { getPersona } from '@/lib/onboarding/persona-context'

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()

const putSchema = z.object({
  nombre: optionalText(200),
  empresa: optionalText(200),
  email: z.string().trim().email('Email no válido').max(200).nullable().optional().or(z.literal('')),
  telefono: optionalText(50),
  ciudad: optionalText(120),
  direccion_fiscal: optionalText(500),
  cif: optionalText(30),
})

/** Datos de contacto de la persona. Sin contacto no hay persona. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireLeadAccessAPI(req, res, req.query.leadId)
    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) return res.status(400).json({ error: 'leadId inválido' })
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' })

    const body = putSchema.parse(req.body ?? {})
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { contact_id: true } })
    if (!lead?.contact_id) return res.status(400).json({ error: 'La persona no tiene contacto' })

    const data: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue
      data[k] = v === '' ? null : v
    }
    await prisma.contact.update({ where: { id: lead.contact_id }, data })
    const persona = await getPersona(leadId)
    return res.json({ persona })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[onboarding/personas/contacto]', error)
    return res.status(500).json({ error: 'No se pudo guardar el contacto' })
  }
}
