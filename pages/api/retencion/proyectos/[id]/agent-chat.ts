import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { getOrCreateAgentConfig, toPublicConfig } from '@/lib/retencion/agent-config-store'
import { buildProyectoContext } from '@/lib/retencion/eligibility'
import { runRetentionAgentTurn } from '@/lib/retencion/retention-agent'
import type { RetencionAuditStatus } from '@/lib/retencion/report-prompt'

const bodySchema = z.object({
  message: z.string().min(1).max(100000),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    if (!proyectoId) return res.status(400).json({ error: 'id requerido' })

    await assertProjectAccess(user, proyectoId, res)
    const proyecto = await buildProyectoContext(proyectoId)
    if (!proyecto) {
      return res.status(403).json({
        error: 'Solo proyectos Buffalo en marcha con mensualidad',
      })
    }

    const parsed = bodySchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.errors[0]?.message || 'Mensaje inválido',
      })
    }
    const { message } = parsed.data
    const row = await getOrCreateAgentConfig(proyectoId)
    const publicCfg = toPublicConfig(row)

    const result = await runRetentionAgentTurn({
      proyectoId,
      proyecto,
      userMessage: message,
      history: publicCfg.audit_messages,
      auditStatus: publicCfg.audit_status as RetencionAuditStatus,
      knowledge: publicCfg.audit_knowledge,
      schemaSummary: publicCfg.schema_summary,
      hasDb: publicCfg.db_connected,
    })

    const refreshed = toPublicConfig(await getOrCreateAgentConfig(proyectoId))

    return res.status(200).json({
      ...result,
      config: refreshed,
    })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }
    console.error('[retencion/agent-chat]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno',
    })
  }
}
