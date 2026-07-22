import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible, buildProyectoContext } from '@/lib/retencion/eligibility'
import {
  getDecryptedDbUrl,
  getMetricQueries,
  saveMetricQueries,
} from '@/lib/retencion/agent-config-store'
import { discoverMetrics } from '@/lib/retencion/metrics/discover-metrics'
import { derivePeriods, runMetrics } from '@/lib/retencion/metrics/run-metrics'
import type { MetricDef } from '@/lib/retencion/metrics/types'

const metricSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  unit: z.string().max(40).optional(),
  source_table: z.string().max(200).nullable().optional(),
  time_column: z.string().max(200).nullable().optional(),
  kind: z.enum(['scalar', 'series']).optional(),
  sql: z.string().min(10).max(4000),
})

const patchSchema = z.object({
  metrics: z.array(metricSchema).max(40),
})

const postSchema = z.object({
  preview: z.boolean().optional(),
  year: z.number().int().min(2020).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
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
      const defs = await getMetricQueries(proyectoId)
      return res.status(200).json({ metrics: defs ?? [] })
    }

    if (req.method === 'PATCH') {
      const parsed = patchSchema.parse(req.body || {})
      await saveMetricQueries(proyectoId, parsed.metrics as MetricDef[])
      return res.status(200).json({ metrics: parsed.metrics })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const url = await getDecryptedDbUrl(proyectoId)
    if (!url) {
      return res.status(400).json({
        error: 'No hay Postgres conectado. Conecta la BD del cliente antes de descubrir métricas.',
      })
    }

    const parsed = postSchema.parse(req.body || {})
    const proyecto = await buildProyectoContext(proyectoId)

    const disc = await discoverMetrics({
      url,
      productType: proyecto?.service_type,
    })
    if (disc.defs.length === 0) {
      return res.status(200).json({
        metrics: [],
        schema_tables: disc.schemaTables,
        note: 'No se pudieron proponer métricas (schema vacío o no interpretable).',
      })
    }
    await saveMetricQueries(proyectoId, disc.defs)

    // Preview opcional: ejecuta las métricas contra el periodo indicado
    let preview: unknown = null
    if (parsed.preview) {
      const now = new Date()
      const year = parsed.year ?? now.getFullYear()
      const month = parsed.month ?? now.getMonth() + 1
      const results = await runMetrics(url, disc.defs, derivePeriods(year, month))
      preview = results.map((r) => ({
        id: r.def.id,
        label: r.def.label,
        value: r.value,
        prev: r.prev,
        delta: r.delta,
        status: r.status,
        error: r.error,
      }))
    }

    return res.status(200).json({
      metrics: disc.defs,
      schema_tables: disc.schemaTables,
      preview,
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
    console.error('[retencion/metrics/discover]', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error interno' })
  }
}
