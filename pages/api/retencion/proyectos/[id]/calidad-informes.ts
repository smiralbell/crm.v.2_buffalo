import type { NextApiRequest, NextApiResponse } from 'next'
import { z, ZodError } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { listMcpServers } from '@/lib/retencion/mcp/store'
import { runReport } from '@/lib/retencion/qa/reports'
import { getReportConfig, listNormas, listReportRuns, saveReportConfig } from '@/lib/retencion/qa/store'
import type { ReportKind } from '@/lib/retencion/qa/types'

const kindSchema = z.enum(['real', 'mejoras'])
const patchSchema = z.object({
  enabled: z.boolean(),
  every_minutes: z.number().int().min(0).max(43200),
  whatsapp: z.object({ enabled: z.boolean(), to: z.array(z.string().trim().max(40)).max(20) }),
})

/**
 * Flujos de informe de la calidad (?kind=real | mejoras).
 * GET: configuración, ejecuciones y estado de las fuentes · PATCH: configuración · POST {action:'run'}: ejecutar ya.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    if (!proyectoId) return res.status(400).json({ error: 'id requerido' })
    await assertProjectAccess(user, proyectoId, res)
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })
    const kind: ReportKind = kindSchema.parse(req.query.kind)

    const respond = async (status = 200, extra: Record<string, unknown> = {}) => {
      const [config, runs, servers, normas] = await Promise.all([
        getReportConfig(proyectoId, kind),
        listReportRuns(proyectoId, kind),
        listMcpServers(proyectoId),
        listNormas(proyectoId),
      ])
      return res.status(status).json({
        config,
        runs,
        mcp_connected: servers.filter((s) => s.estado === 'conectado').map((s) => s.nombre),
        normas_activas: normas.filter((n) => n.estado === 'activa').length,
        ...extra,
      })
    }

    if (req.method === 'GET') return respond()
    if (user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' })

    if (req.method === 'PATCH') {
      await saveReportConfig(proyectoId, kind, patchSchema.parse(req.body || {}))
      return respond()
    }

    if (req.method === 'POST') {
      if ((req.body as { action?: string } | undefined)?.action !== 'run') return res.status(400).json({ error: 'action debe ser run' })
      const runId = await runReport(proyectoId, kind, 'manual')
      if (!runId) return res.status(409).json({ error: 'Ya hay un informe en marcha' })
      return respond(202, { run_id: runId })
    }

    res.setHeader('Allow', 'GET, PATCH, POST')
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    if (res.headersSent) return
    if (e instanceof ZodError) return res.status(400).json({ error: e.issues[0]?.message || 'Datos no válidos' })
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error' })
  }
}
