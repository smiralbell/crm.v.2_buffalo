import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuthAPI(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()

  const { prospect_id } = req.body
  if (!prospect_id) return res.status(400).json({ error: 'prospect_id requerido' })

  const prospect = await prisma.coldCallProspect.findFirst({
    where: { id: parseInt(prospect_id), deleted_at: null },
  })
  if (!prospect) return res.status(404).json({ error: 'Prospecto no encontrado' })

  // Verificar si ya existe un contacto con ese teléfono o email
  let contact = null
  if (prospect.email) {
    contact = await prisma.contact.findFirst({ where: { email: prospect.email } })
  }
  if (!contact && prospect.telefono) {
    contact = await prisma.contact.findFirst({ where: { telefono: prospect.telefono } })
  }

  // Crear contacto si no existe
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        nombre:   prospect.nombre,
        empresa:  prospect.empresa || undefined,
        telefono: prospect.telefono || undefined,
        email:    prospect.email || undefined,
        ciudad:   prospect.zona || undefined,
      },
    })
  }

  // Verificar si ya tiene un lead
  const existingLead = await prisma.lead.findFirst({ where: { contact_id: contact.id } })
  if (existingLead) {
    return res.json({ contact_id: contact.id, lead_id: existingLead.id, existing: true })
  }

  // Crear lead
  const lead = await prisma.lead.create({
    data: {
      contact_id:       contact.id,
      estado:           'caliente',
      origen_principal: 'cold_calling',
      prioridad:        'alta',
      ultima_interaccion: new Date(),
    },
  })

  // Marcar prospecto como convertido
  await prisma.coldCallProspect.update({
    where: { id: prospect.id },
    data: { estado: 'reunion_agendada', updated_at: new Date() },
  })

  return res.status(201).json({ contact_id: contact.id, lead_id: lead.id, existing: false })
}
