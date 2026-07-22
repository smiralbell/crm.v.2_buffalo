import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import {
  clearDbUrl,
  getOrCreateAgentConfig,
  saveDbUrl,
  toPublicConfig,
  updateAgentConfig,
} from '@/lib/retencion/agent-config-store'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { probeConnection } from '@/lib/retencion/readonly-postgres'
import {
  DEFAULT_RETENCION_REPORT_PROMPT,
  DEFAULT_RETENCION_REPORT_PROMPT_BUFFALO,
} from '@/lib/retencion/report-prompt'
import { seedKnowledgeOnAuditStart, toolSeedKnowledgeFromCrm } from '@/lib/retencion/knowledge'

const patchSchema = z.object({
  report_prompt: z.string().min(20).max(20000).optional(),
  report_prompt_buffalo: z.string().min(20).max(20000).optional(),
  client_db_url: z.string().min(10).max(2000).optional(),
  clear_db_url: z.boolean().optional(),
  start_audit: z.boolean().optional(),
  refresh_crm_knowledge: z.boolean().optional(),
  overwrite_crm_knowledge: z.boolean().optional(),
  mark_ready: z.boolean().optional(),
  audit_knowledge: z.string().max(200000).optional(),
  schema_summary: z.string().max(100000).optional(),
  audit_status: z
    .enum(['pending', 'discovery', 'db_needed', 'schema_audit', 'ready'])
    .optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    if (!proyectoId) return res.status(400).json({ error: 'id requerido' })

    await assertProjectAccess(user, proyectoId, res)
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })

    if (req.method === 'GET') {
      try {
        const row = await getOrCreateAgentConfig(proyectoId)
        return res.status(200).json({ config: toPublicConfig(row) })
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (msg.includes('retencion_agent_configs') || msg.includes('does not exist')) {
          return res.status(503).json({
            error: 'Falta migrar tablas de retención. Ejecuta prisma/CREATE_RETENCION_AGENT.sql',
          })
        }
        throw e
      }
    }

    if (req.method === 'PATCH') {
      const parsed = patchSchema.parse(req.body || {})

      if (parsed.clear_db_url) {
        const row = await clearDbUrl(proyectoId)
        return res.status(200).json({ config: toPublicConfig(row) })
      }

      if (parsed.client_db_url) {
        const url = parsed.client_db_url.trim()
        if (!/^postgres(ql)?:\/\//i.test(url)) {
          return res.status(400).json({
            error: 'La URL debe ser postgres:// o postgresql://',
          })
        }
        const probe = await probeConnection(url)
        if (!probe.ok) {
          return res.status(400).json({
            error: `No se pudo conectar (solo lectura): ${probe.error}`,
          })
        }
        const row = await saveDbUrl(proyectoId, url)
        return res.status(200).json({
          config: toPublicConfig(row),
          probe: { version: probe.version },
        })
      }

      if (parsed.report_prompt != null || parsed.report_prompt_buffalo != null) {
        const row = await updateAgentConfig(proyectoId, {
          report_prompt: parsed.report_prompt,
          report_prompt_buffalo: parsed.report_prompt_buffalo,
        })
        return res.status(200).json({ config: toPublicConfig(row) })
      }

      if (parsed.start_audit) {
        await updateAgentConfig(proyectoId, {
          audit_status: 'discovery',
        })
        const seed = await seedKnowledgeOnAuditStart(proyectoId)
        const row = await getOrCreateAgentConfig(proyectoId)
        return res.status(200).json({
          config: toPublicConfig(row),
          crm_seed: seed,
        })
      }

      if (parsed.refresh_crm_knowledge) {
        const result = await toolSeedKnowledgeFromCrm(proyectoId, {
          overwrite: parsed.overwrite_crm_knowledge === true,
          mark_ready: false,
        })
        const row = await getOrCreateAgentConfig(proyectoId)
        return res.status(200).json({
          config: toPublicConfig(row),
          crm_seed: result,
        })
      }

      if (
        parsed.mark_ready ||
        parsed.audit_knowledge != null ||
        parsed.schema_summary != null ||
        parsed.audit_status != null
      ) {
        const row = await updateAgentConfig(proyectoId, {
          audit_status: parsed.mark_ready ? 'ready' : parsed.audit_status,
          audit_knowledge: parsed.audit_knowledge,
          schema_summary: parsed.schema_summary,
        })
        return res.status(200).json({ config: toPublicConfig(row) })
      }

      const row = await getOrCreateAgentConfig(proyectoId)
      return res.status(200).json({
        config: toPublicConfig(row),
        default_prompt: DEFAULT_RETENCION_REPORT_PROMPT,
        default_prompt_buffalo: DEFAULT_RETENCION_REPORT_PROMPT_BUFFALO,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }
    console.error('[retencion/agent-config]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno',
    })
  }
}
