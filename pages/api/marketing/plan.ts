import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireMarketingAPI } from '@/lib/auth'
import {
  createPlanItem,
  deletePlanItem,
  getPlanMonth,
  planGoalsInput,
  planItemInput,
  planItemPatch,
  savePlanGoals,
  updatePlanItem,
} from '@/lib/marketing/plan'

/**
 * Planificación de marketing.
 * GET    ?period=YYYY-MM          → piezas y objetivos del mes
 * POST   { ...pieza }             → nueva pieza
 * PATCH  ?id=N { ...cambios }     → editar pieza
 * DELETE ?id=N                    → borrar esa pieza (solo del calendario)
 * PUT    { period, objetivos }    → guardar objetivos del mes
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireMarketingAPI(req, res)
  } catch {
    return
  }

  try {
    if (req.method === 'GET') {
      const raw = typeof req.query.period === 'string' ? req.query.period : ''
      const now = new Date()
      const period = /^\d{4}-\d{2}$/.test(raw)
        ? raw
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      return res.status(200).json(await getPlanMonth(period, { create: true }))
    }

    if (req.method === 'POST') {
      const input = planItemInput.parse(req.body)
      return res.status(201).json({ item: await createPlanItem(input, user.email) })
    }

    const id = Number(req.query.id)
    if (req.method === 'PATCH') {
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' })
      const item = await updatePlanItem(id, planItemPatch.parse(req.body))
      if (!item) return res.status(404).json({ error: 'Pieza no encontrada' })
      return res.status(200).json({ item })
    }

    if (req.method === 'DELETE') {
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' })
      const ok = await deletePlanItem(id)
      return ok ? res.status(200).json({ ok: true }) : res.status(404).json({ error: 'Pieza no encontrada' })
    }

    if (req.method === 'PUT') {
      return res.status(200).json({ goals: await savePlanGoals(planGoalsInput.parse(req.body)) })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0]?.message || 'Datos inválidos' })
    console.error('[api/marketing/plan]', err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
