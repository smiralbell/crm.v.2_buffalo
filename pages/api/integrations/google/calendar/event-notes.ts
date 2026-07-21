import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { getEventNotesMap, saveEventNote } from '@/lib/integrations/google/event-notes'
import { googleOwnerKey } from '@/lib/integrations/google/owner'

const putSchema = z.object({
  eventId: z.string().min(1),
  notes: z.string().max(8000),
})

/**
 * GET ?eventIds=a,b,c  → { notes: Record<eventId, text> }
 * PUT { eventId, notes } → guarda nota del evento
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const ownerKey = googleOwnerKey(user)

    if (req.method === 'GET') {
      const raw = typeof req.query.eventIds === 'string' ? req.query.eventIds : ''
      const eventIds = raw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 200)
      const notes = await getEventNotesMap(ownerKey, eventIds)
      return res.status(200).json({ notes })
    }

    if (req.method === 'PUT') {
      const data = putSchema.parse(req.body)
      const notes = await saveEventNote(ownerKey, data.eventId, data.notes)
      return res.status(200).json({ eventId: data.eventId, notes, saved: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.errors[0]?.message || 'Datos inválidos' })
    }
    if (
      e instanceof Error &&
      (e.message === 'No session' || e.message === 'Invalid session' || e.message === 'Expired session')
    ) {
      return
    }
    console.error('[google/calendar/event-notes]', e)
    return res.status(500).json({
      error: e instanceof Error ? e.message : 'Error al guardar notas',
    })
  }
}
