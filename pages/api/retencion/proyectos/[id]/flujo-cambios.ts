import type { NextApiRequest, NextApiResponse } from 'next'
import { z, ZodError } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { classifyChange, scanRepo, scanTickets } from '@/lib/retencion/qa/flow1'
import { decideInbox, getFlow1Public, saveFlow1Config } from '@/lib/retencion/qa/store'

const configSchema = z.object({
  manual: z.boolean(),
  tickets: z.boolean(),
  repo: z.boolean(),
  repo_every_minutes: z.number().int().min(15).max(10080),
})

const postSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('manual'), titulo: z.string().trim().max(200).optional(), texto: z.string().trim().min(5, 'Describe la mejora').max(8000) }),
  z.object({ action: z.literal('decide'), id: z.string().min(1), decision: z.enum(['aprobar', 'descartar']), regla: z.string().trim().max(400).optional() }),
  z.object({ action: z.literal('scan_now') }),
])

/**
 * Flujo 1 · pruebas de cambios.
 * GET: configuración, normas y bandeja · PATCH: configuración · POST: mejora manual, decidir o revisar ahora.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    if (!proyectoId) return res.status(400).json({ error: 'id requerido' })
    await assertProjectAccess(user, proyectoId, res)
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })

    if (req.method === 'GET') return res.status(200).json({ flow: await getFlow1Public(proyectoId) })

    if (user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' })

    if (req.method === 'PATCH') {
      await saveFlow1Config(proyectoId, configSchema.parse(req.body || {}))
      return res.status(200).json({ flow: await getFlow1Public(proyectoId) })
    }

    if (req.method === 'POST') {
      const body = postSchema.parse(req.body || {})
      if (body.action === 'manual') {
        const items = await classifyChange(proyectoId, {
          origen: 'manual',
          origen_ref: null,
          titulo: body.titulo || body.texto.split('\n')[0].slice(0, 140),
          texto: body.texto,
        })
        return res.status(201).json({ items, flow: await getFlow1Public(proyectoId) })
      }
      if (body.action === 'decide') {
        const proj = await query<{ name: string }>(`SELECT name FROM proyectos WHERE id = $1`, [proyectoId])
        const result = await decideInbox(proyectoId, proj.rows[0]?.name || 'Proyecto', body.id, body.decision, { regla: body.regla })
        return res.status(200).json({ ...result, flow: await getFlow1Public(proyectoId) })
      }
      const flow = await getFlow1Public(proyectoId)
      const out: { tickets?: number; repo?: string } = {}
      if (flow.config.tickets) out.tickets = await scanTickets(proyectoId)
      if (flow.config.repo) {
        try {
          const r = await scanRepo(proyectoId)
          out.repo = r.baseline ? 'Referencia tomada: se revisarán los commits a partir de ahora' : `${r.commits ?? 0} commits · ${r.added} propuestas`
        } catch (e) {
          out.repo = e instanceof Error ? e.message : String(e)
        }
      }
      return res.status(200).json({ scan: out, flow: await getFlow1Public(proyectoId) })
    }

    res.setHeader('Allow', 'GET, PATCH, POST')
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    if (res.headersSent) return
    if (e instanceof ZodError) return res.status(400).json({ error: e.issues[0]?.message || 'Datos no válidos' })
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error' })
  }
}
