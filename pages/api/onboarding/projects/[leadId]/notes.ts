import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNote, listNotes } from '@/lib/onboarding/notes/store'

const postSchema = z.object({
  note_date: z.string().optional(),
  type: z.enum(['reunion', 'libre', 'definicion']).optional(),
  title: z.string().max(500).optional(),
  body: z.string().max(500000).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' })
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    if (req.method === 'GET') {
      const notes = await listNotes(leadId)
      return res.status(200).json({ ok: true, notes })
    }

    if (req.method === 'POST') {
      const body = postSchema.parse(req.body ?? {})
      const note = await createNote({
        lead_id: leadId,
        note_date: body.note_date,
        type: body.type,
        title: body.title,
        body: body.body,
        created_by: user.email || user.name || String(user.id),
      })
      return res.status(201).json({ ok: true, note })
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
    console.error('[onboarding/notes]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error en notas',
    })
  }
}
