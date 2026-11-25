import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireMarketingAPI } from '@/lib/auth'
import {
  OutcomeError,
  addDecision,
  decisionInput,
  getReview,
  notesInput,
  removeDecision,
  resultInput,
  saveReviewNotes,
  setDecisionResult,
} from '@/lib/marketing/sales'

/**
 * Revisión del lunes.
 * GET ?week=YYYY-MM-DD · POST decisión (crea tarea) · PATCH ?id { resultado } · DELETE ?id (la tarea no se toca) · PUT notas
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireMarketingAPI(req, res)
  } catch {
    return
  }
  const id = Number(req.query.id)
  const validId = Number.isInteger(id) && id > 0
  try {
    if (req.method === 'GET') {
      const raw = typeof req.query.week === 'string' ? req.query.week : ''
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw))
      return res.status(200).json(await getReview(ok ? raw : new Date().toISOString().slice(0, 10), user))
    }
    if (req.method === 'POST') {
      await addDecision(decisionInput.parse(req.body), user)
      return res.status(201).json({ ok: true })
    }
    if (req.method === 'PUT') {
      await saveReviewNotes(notesInput.parse(req.body), user.email)
      return res.status(200).json({ ok: true })
    }
    if (req.method === 'PATCH' || req.method === 'DELETE') {
      if (!validId) return res.status(400).json({ error: 'id inválido' })
      const done =
        req.method === 'PATCH'
          ? await setDecisionResult(id, resultInput.parse(req.body).resultado ?? null)
          : await removeDecision(id)
      return done ? res.status(200).json({ ok: true }) : res.status(404).json({ error: 'Decisión no encontrada' })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message })
    if (err instanceof OutcomeError) return res.status(409).json({ error: err.message })
    console.error('[api/marketing/review]', err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
