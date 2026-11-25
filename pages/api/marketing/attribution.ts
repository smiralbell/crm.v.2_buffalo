import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireMarketingAPI } from '@/lib/auth'
import {
  attributionInput,
  clearAttribution,
  createManualLead,
  getAttributionMonth,
  getLeadAttribution,
  manualLeadInput,
  saveAttribution,
} from '@/lib/marketing/attribution'

/**
 * Cómo nos conoció cada lead.
 * GET    ?period=YYYY-MM  → leads del mes y cuáles faltan por confirmar
 * GET    ?lead_id=N       → un lead
 * POST   { lead a mano }  → apuntar un lead (no duplica si ya existe)
 * PUT    { lead_id, canal, via, nota } → confirmar o corregir el canal
 * DELETE ?lead_id=N       → quitar la corrección (el lead no se toca)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireMarketingAPI(req, res)
  } catch {
    return
  }
  const leadId = Number(req.query.lead_id)
  try {
    if (req.method === 'GET') {
      if (req.query.lead_id !== undefined) {
        const lead = leadId > 0 && Number.isInteger(leadId) ? await getLeadAttribution(leadId) : null
        return lead ? res.status(200).json({ lead }) : res.status(404).json({ error: 'Lead no encontrado' })
      }
      const raw = typeof req.query.period === 'string' ? req.query.period : ''
      const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : new Date().toISOString().slice(0, 7)
      return res.status(200).json(await getAttributionMonth(period))
    }
    if (req.method === 'POST') {
      return res.status(201).json(await createManualLead(manualLeadInput.parse(req.body), user.email))
    }
    if (req.method === 'PUT') {
      const lead = await saveAttribution(attributionInput.parse(req.body), user.email)
      return lead ? res.status(200).json({ lead }) : res.status(404).json({ error: 'Lead no encontrado' })
    }
    if (req.method === 'DELETE') {
      if (!Number.isInteger(leadId) || leadId <= 0) return res.status(400).json({ error: 'lead_id inválido' })
      const lead = await clearAttribution(leadId)
      return lead ? res.status(200).json({ lead }) : res.status(404).json({ error: 'Lead no encontrado' })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message })
    console.error('[api/marketing/attribution]', err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
