import type { NextApiRequest, NextApiResponse } from 'next'
import { z, ZodError } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { listMcpServers } from '@/lib/retencion/mcp/store'
import { localReposAllowed } from '@/lib/retencion/qa/repo-reader'
import { defaultRepo, startSpider } from '@/lib/retencion/qa/spider'
import { getBrainPublic, saveBrainSources, setTourStep } from '@/lib/retencion/qa/store'
import { TOUR_STEPS, type TourStep } from '@/lib/retencion/qa/types'

const patchSchema = z.object({
  repo_source: z.string().max(500).nullish(),
  repo_branch: z.string().max(200).nullish(),
  retell_api_key: z.string().max(400).nullish(),
  clear_retell: z.boolean().optional(),
  tour_step: z.enum(TOUR_STEPS as [TourStep, ...TourStep[]]).optional(),
})

/**
 * Cerebro del proyecto (calidad).
 * GET: estado del rastreo y cerebro · PATCH: fuentes y paso del tutorial · POST {action:'start'}: lanza la araña.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    if (!proyectoId) return res.status(400).json({ error: 'id requerido' })
    await assertProjectAccess(user, proyectoId, res)
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })

    const respond = async (status = 200) => {
      const [brain, servers, repoDefault] = await Promise.all([
        getBrainPublic(proyectoId),
        listMcpServers(proyectoId),
        defaultRepo(proyectoId),
      ])
      return res.status(status).json({
        brain,
        sources: {
          repo_default: repoDefault,
          mcp_connected: servers.filter((s) => s.estado === 'conectado').map((s) => s.nombre),
          mcp_total: servers.length,
          local_repos: localReposAllowed(),
        },
      })
    }

    if (req.method === 'GET') {
      void import('@/lib/retencion/watch-scheduler')
        .then((m) => m.startRetencionWatchScheduler())
        .catch(() => undefined)
      return respond()
    }

    if (req.method === 'PATCH') {
      const body = patchSchema.parse(req.body || {})
      const touchesSources =
        body.repo_source !== undefined || body.repo_branch !== undefined || body.retell_api_key !== undefined || body.clear_retell
      if (touchesSources && user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' })
      if (touchesSources) await saveBrainSources(proyectoId, body)
      if (body.tour_step) await setTourStep(proyectoId, body.tour_step)
      return respond()
    }

    if (req.method === 'POST') {
      if (user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' })
      const action = (req.body as { action?: string } | undefined)?.action
      if (action !== 'start') return res.status(400).json({ error: 'action debe ser start' })
      const started = await startSpider(proyectoId)
      if (!started) return res.status(409).json({ error: 'Ya hay un rastreo en marcha' })
      return respond(202)
    }

    res.setHeader('Allow', 'GET, PATCH, POST')
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    if (res.headersSent) return
    if (e instanceof ZodError) return res.status(400).json({ error: e.issues[0]?.message || 'Datos no válidos' })
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error' })
  }
}
