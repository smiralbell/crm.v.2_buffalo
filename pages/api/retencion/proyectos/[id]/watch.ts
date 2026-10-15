import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { clearDbUrl, getDecryptedDbUrl, saveDbUrl } from '@/lib/retencion/agent-config-store'
import { probeConnection, redactDbError } from '@/lib/retencion/readonly-postgres'
import { getWatchPublic, saveWatchSettings } from '@/lib/retencion/watch-store'
import { syncWatchSchema } from '@/lib/retencion/watch-db-memory'
import { runWatchForProject } from '@/lib/retencion/watch-agent'

const patchSchema = z.object({
  client_db_url: z.string().min(10).max(2000).optional(),
  clear_db_url: z.boolean().optional(),
  knowledge: z.string().max(200000).optional(),
  agent_prompt: z.string().max(20000).optional(),
  watch_prompt: z.string().max(20000).optional(),
  watch_model: z.string().min(3).max(120).optional(),
  every_minutes: z.number().int().min(0).max(86400).optional(),
  excluded_tables: z.array(z.string().max(200)).max(500).optional(),
  excluded_columns: z.array(z.string().max(260)).max(2000).optional(),
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
      const watch = await getWatchPublic(proyectoId)
      return res.status(200).json({ watch })
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores' })
    }

    if (req.method === 'POST') {
      const action = (req.body as { action?: string; client_db_url?: string } | undefined)?.action
      if (action === 'sync_schema') {
        const pasted = String(
          (req.body as { client_db_url?: string } | undefined)?.client_db_url || ''
        ).trim()
        let dbUrl = pasted
        if (dbUrl) {
          if (!/^postgres(ql)?:\/\//i.test(dbUrl)) {
            return res.status(400).json({ error: 'La URL debe ser postgres:// o postgresql://' })
          }
          const probe = await probeConnection(dbUrl)
          if (!probe.ok) {
            return res.status(400).json({
              error: `No se pudo conectar (solo lectura): ${probe.error}`,
            })
          }
          await saveDbUrl(proyectoId, dbUrl)
        } else {
          dbUrl = (await getDecryptedDbUrl(proyectoId)) || ''
        }
        if (!dbUrl) {
          return res.status(400).json({ error: 'Pega la URL de PostgreSQL y pulsa Conectar y sincronizar' })
        }
        await syncWatchSchema(proyectoId, dbUrl)
        const watch = await getWatchPublic(proyectoId)
        return res.status(200).json({ watch })
      }
      if (action !== 'run') return res.status(400).json({ error: 'action debe ser run o sync_schema' })
      const result = await runWatchForProject(proyectoId)
      const watch = await getWatchPublic(proyectoId)
      return res.status(200).json({ result, watch })
    }

    if (req.method === 'PATCH') {
      const parsed = patchSchema.parse(req.body || {})

      if (parsed.clear_db_url) {
        await clearDbUrl(proyectoId)
      } else if (parsed.client_db_url) {
        const url = parsed.client_db_url.trim()
        if (!/^postgres(ql)?:\/\//i.test(url)) {
          return res.status(400).json({ error: 'La URL debe ser postgres:// o postgresql://' })
        }
        const probe = await probeConnection(url)
        if (!probe.ok) {
          return res.status(400).json({
            error: `No se pudo conectar (solo lectura): ${probe.error}`,
          })
        }
        await saveDbUrl(proyectoId, url)
        try {
          await syncWatchSchema(proyectoId, url)
        } catch (e) {
          const watch = await saveWatchSettings(proyectoId, {
            every_minutes: parsed.every_minutes,
            watch_prompt: parsed.watch_prompt,
            watch_model: parsed.watch_model,
            knowledge: parsed.knowledge,
            agent_prompt: parsed.agent_prompt,
            excluded_tables: parsed.excluded_tables,
            excluded_columns: parsed.excluded_columns,
          })
          return res.status(200).json({
            watch,
            warning: `Conectada, pero no se pudo leer el esquema: ${e instanceof Error ? e.message : String(e)}`,
          })
        }
      }

      const watch = await saveWatchSettings(proyectoId, {
        every_minutes: parsed.every_minutes,
        watch_prompt: parsed.watch_prompt,
        watch_model: parsed.watch_model,
        knowledge: parsed.knowledge,
        agent_prompt: parsed.agent_prompt,
        excluded_tables: parsed.excluded_tables,
        excluded_columns: parsed.excluded_columns,
      })
      return res.status(200).json({ watch })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message || 'Datos inválidos' })
    }
    if (res.headersSent) return
    console.error('[retencion/watch]', redactDbError(err))
    return res.status(500).json({ error: redactDbError(err) || 'Error interno' })
  }
}
