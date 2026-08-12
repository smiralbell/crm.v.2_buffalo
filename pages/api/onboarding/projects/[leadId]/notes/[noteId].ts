import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { deleteNote, getNote, updateNote } from '@/lib/onboarding/notes/store'

const patchSchema = z.object({
  note_date: z.string().optional(),
  type: z.enum(['reunion', 'libre', 'definicion']).optional(),
  title: z.string().max(500).optional(),
  body: z.string().max(500000).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
    const leadId = parseInt(String(req.query.leadId), 10)
    const noteId = String(req.query.noteId || '')
    if (!Number.isFinite(leadId) || leadId <= 0 || !noteId) {
      return res.status(400).json({ error: 'Parámetros inválidos' })
    }

    const existing = await getNote(noteId)
    if (!existing || existing.lead_id !== leadId) {
      return res.status(404).json({ error: 'Nota no encontrada' })
    }

    if (req.method === 'PATCH') {
      const body = patchSchema.parse(req.body ?? {})
      const note = await updateNote(noteId, body)
      return res.status(200).json({ ok: true, note })
    }

    if (req.method === 'DELETE') {
      await deleteNote(noteId)
      return res.status(200).json({ ok: true })
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
    console.error('[onboarding/notes/id]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error en nota',
    })
  }
}
