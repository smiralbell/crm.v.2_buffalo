import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveActivity } from '@/lib/crm/activities'
import { dismissAlert } from '@/lib/leads/lead-extras'
import { isSessionError, requireLeadPage } from '@/lib/leads/lead-api-guard'

/** POST { alert_id }: quita un aviso de la ficha (para todo el equipo). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireLeadPage(req, res)
    if (!ctx) return
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const alertId = String((req.body || {}).alert_id || '').trim()
    if (!alertId) return res.status(400).json({ error: 'Falta el aviso' })
    // Las alertas manuales son actividades: se marcan como resueltas
    const manual = alertId.match(/^manual-alert-(\d+)$/)
    if (manual) await resolveActivity(manual[1])
    await dismissAlert(ctx.leadId, alertId, ctx.user.email ?? ctx.user.name ?? null)
    return res.json({ ok: true })
  } catch (error) {
    if (isSessionError(error)) return
    console.error('[leads/avisos]', error)
    return res.status(500).json({ error: 'No se pudo quitar el aviso' })
  }
}
