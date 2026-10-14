import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { clearDbUrl, saveDbUrl } from '@/lib/retencion/agent-config-store'
import { probeConnection } from '@/lib/retencion/readonly-postgres'
import { getWatchPublic, saveWatchSettings } from '@/lib/retencion/watch-store'
import { runWatchForProject } from '@/lib/retencion/watch-agent'

const patchSchema = z.object({
  client_db_url: z.string().min(10).max(2000).optional(),
  clear_db_url: z.boolean().optional(),
  knowledge: z.string().max(200000).optional(),
  agent_prompt: z.string().max(20000).optional(),
  watch_prompt: z.string().max(20000).optional(),
  every_minutes: z.number().int().min(0).max(86400).optional(),
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
      const action = (req.body as { action?: string } | undefined)?.action
      if (action !== 'run') return res.status(400).json({ error: 'action debe ser run' })
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
          return res.status(400).json({ error: `No se pudo conectar (solo lectura): ${probe.error}` })
        }
        await saveDbUrl(proyectoId, url)
      }

      const watch = await saveWatchSettings(proyectoId, {
        every_minutes: parsed.every_minutes,
        watch_prompt: parsed.watch_prompt,
        knowledge: parsed.knowledge,
        agent_prompt: parsed.agent_prompt,
      })
      return res.status(200).json({ watch })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message || 'Datos inválidos' })
    }
    if (res.headersSent) return
    console.error('[retencion/watch]', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' })
  }
}
