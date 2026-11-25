import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { getFlujo, listRuns } from '@/lib/retencion/flujos/store'
import { renderFlowPdf, sendFlowToWhatsapp } from '@/lib/retencion/flujos/whatsapp'

/**
 * GET  → el PDF de la última ejecución correcta (para ver cómo queda).
 * POST → envía ese PDF ahora a los móviles del nodo de WhatsApp.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    const flujoId = String(req.query.flujoId || '')
    if (!proyectoId || !flujoId) return res.status(400).json({ error: 'ids requeridos' })
    await assertProjectAccess(user, proyectoId, res)
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })

    const flujo = await getFlujo(proyectoId, flujoId)
    if (!flujo) return res.status(404).json({ error: 'Flujo no encontrado' })
    const lastOk = (await listRuns(flujoId, 20)).find((r) => r.status === 'ok')
    if (!lastOk) return res.status(400).json({ error: 'El flujo todavía no tiene una ejecución correcta' })

    if (req.method === 'GET') {
      const file = await renderFlowPdf(flujo, lastOk.output)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`)
      return res.status(200).send(file.buffer)
    }
    if (req.method === 'POST') {
      if (user.role === 'developer') return res.status(403).json({ error: 'Sin permiso' })
      const out = await sendFlowToWhatsapp(flujo, lastOk.output)
      if (out.sent === 0) return res.status(400).json({ error: out.errors.join('; ') || 'No se envió nada' })
      return res.status(200).json(out)
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) return
    console.error('[retencion/flujos/whatsapp]', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo enviar' })
  }
}
