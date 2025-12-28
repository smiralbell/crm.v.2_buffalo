import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Probar conexión básica
    await prisma.$queryRaw`SELECT 1`

    // Contar contactos
    const contactCount = await prisma.contact.count()
    
    // Contar leads
    const leadCount = await prisma.lead.count()

    // Obtener algunos contactos
    const contacts = await prisma.contact.findMany({
      take: 5,
      select: {
        id: true,
        nombre: true,
        email: true,
      },
    })

    // Obtener algunos leads
    const leads = await prisma.lead.findMany({
      take: 5,
      select: {
        id: true,
        estado: true,
        contact_id: true,
      },
      include: {
        contact: {
          select: {
            nombre: true,
            email: true,
          },
        },
      },
    })

    return res.status(200).json({
      success: true,
      connection: 'OK',
      stats: {
        contacts: contactCount,
        leads: leadCount,
      },
      sampleContacts: contacts,
      sampleLeads: leads,
    })
  } catch (error: any) {
    console.error('Database test error:', error)
    return res.status(500).json({
      success: false,
      error: error.message,
      connection: 'FAILED',
    })
  }
}

