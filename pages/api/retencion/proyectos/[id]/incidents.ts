import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import {
  buildIncidentsMarkdown,
  incidentsWebhookUrl,
  listIncidents,
} from '@/lib/retencion/incidents'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    if (!proyectoId) return res.status(400).json({ error: 'id requerido' })

    await assertProjectAccess(user, proyectoId, res)
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })

    const incidents = await listIncidents(proyectoId)
    const markdown = buildIncidentsMarkdown({
      proyectoId: eligible.row.id,
      proyectoName: eligible.row.name,
    })

    if (req.query.download === '1' || req.query.format === 'md') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="incidencias-${eligible.row.id}.md"`
      )
      return res.status(200).send(markdown)
    }

    return res.status(200).json({
      webhook_url: incidentsWebhookUrl(),
      client_id: eligible.row.id,
      markdown,
      incidents,
    })
  } catch (err) {
    if (res.headersSent) return
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (msg.includes('retencion_incidents') || msg.includes('does not exist')) {
      return res.status(503).json({ error: 'Falta migrar retencion_incidents' })
    }
    console.error('[retencion/incidents]', err)
    return res.status(500).json({ error: msg })
  }
}
