import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { getOrCreateAgentConfig, toPublicConfig, updateAgentConfig } from '@/lib/retencion/agent-config-store'
import { buildProyectoContext } from '@/lib/retencion/eligibility'
import { generateMonthlyReport } from '@/lib/retencion/retention-agent'
import { prisma } from '@/lib/prisma'
import type { RetencionReportAudience } from '@/lib/retencion/report-prompt'

const bodySchema = z.object({
  year: z.number().int().min(2020).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  compare_previous: z.boolean().optional(),
  audience: z.enum(['client', 'buffalo']).optional(),
})

const patchSchema = z.object({
  id: z.string().uuid().optional(),
  year: z.number().int().min(2020).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  audience: z.enum(['client', 'buffalo']).optional(),
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).max(200000),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    if (!proyectoId) return res.status(400).json({ error: 'id requerido' })
    await assertProjectAccess(user, proyectoId, res)

    if (req.method === 'GET') {
      const rows = await prisma.$queryRawUnsafe<
        {
          id: string
          year: number
          month: number
          audience: string
          title: string | null
          content: string
          meta: unknown
          created_at: Date
        }[]
      >(
        `SELECT id::text, year, month,
                COALESCE(audience, 'client') AS audience,
                title, content, meta, created_at
         FROM retencion_monthly_reports
         WHERE proyecto_id = $1::uuid
         ORDER BY year DESC, month DESC, audience ASC
         LIMIT 48`,
        proyectoId
      )
      return res.status(200).json({
        reports: rows.map((r) => ({
          id: r.id,
          year: r.year,
          month: r.month,
          audience: (r.audience === 'buffalo' ? 'buffalo' : 'client') as RetencionReportAudience,
          title: r.title,
          content: r.content,
          meta: r.meta,
          created_at: r.created_at.toISOString(),
        })),
      })
    }

    if (req.method === 'PATCH') {
      const parsed = patchSchema.parse(req.body || {})
      let updated: {
        id: string
        year: number
        month: number
        audience: string
        title: string | null
        content: string
      }[]

      if (parsed.id) {
        updated = await prisma.$queryRaw`
          UPDATE retencion_monthly_reports SET
            title = COALESCE(${parsed.title ?? null}, title),
            content = ${parsed.content},
            created_at = NOW()
          WHERE id = ${parsed.id}::uuid AND proyecto_id = ${proyectoId}::uuid
          RETURNING id::text, year, month, COALESCE(audience, 'client') AS audience, title, content
        `
      } else {
        const now = new Date()
        const year = parsed.year ?? now.getFullYear()
        const month = parsed.month ?? now.getMonth() + 1
        const audience = parsed.audience ?? 'client'
        updated = await prisma.$queryRaw`
          UPDATE retencion_monthly_reports SET
            title = COALESCE(${parsed.title ?? null}, title),
            content = ${parsed.content},
            created_at = NOW()
          WHERE proyecto_id = ${proyectoId}::uuid
            AND year = ${year}
            AND month = ${month}
            AND COALESCE(audience, 'client') = ${audience}
          RETURNING id::text, year, month, COALESCE(audience, 'client') AS audience, title, content
        `
      }

      if (!updated[0]) {
        return res.status(404).json({ error: 'Informe no encontrado' })
      }

      return res.status(200).json({
        report: {
          id: updated[0].id,
          year: updated[0].year,
          month: updated[0].month,
          audience: updated[0].audience === 'buffalo' ? 'buffalo' : 'client',
          title: updated[0].title,
          content: updated[0].content,
        },
      })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const proyecto = await buildProyectoContext(proyectoId)
    if (!proyecto) {
      return res.status(403).json({ error: 'Proyecto no elegible para retención' })
    }

    let cfg = toPublicConfig(await getOrCreateAgentConfig(proyectoId))

    if (!cfg.audit_knowledge.trim()) {
      return res.status(400).json({
        error:
          'Todavía no hay contexto del proyecto guardado. Completa la auditoría y guarda el contexto (panel «Contexto del proyecto») antes de generar el informe.',
        audit_status: cfg.audit_status,
      })
    }

    if (cfg.audit_status !== 'ready') {
      cfg = toPublicConfig(await updateAgentConfig(proyectoId, { audit_status: 'ready' }))
    }

    const now = new Date()
    const parsed = bodySchema.parse(req.body || {})
    const year = parsed.year ?? now.getFullYear()
    const month = parsed.month ?? now.getMonth() + 1
    const audience: RetencionReportAudience = parsed.audience ?? 'client'
    const reportPrompt =
      audience === 'buffalo' ? cfg.report_prompt_buffalo : cfg.report_prompt

    let previousReport: { year: number; month: number; content: string } | null = null
    if (parsed.compare_previous !== false) {
      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear = month === 1 ? year - 1 : year
      const prevRows = await prisma.$queryRawUnsafe<{ year: number; month: number; content: string }[]>(
        `SELECT year, month, content
         FROM retencion_monthly_reports
         WHERE proyecto_id = $1::uuid
           AND year = $2 AND month = $3
           AND COALESCE(audience, 'client') = $4
         LIMIT 1`,
        proyectoId,
        prevYear,
        prevMonth,
        audience
      )
      if (prevRows[0]) {
        previousReport = prevRows[0]
      } else {
        const anyPrev = await prisma.$queryRawUnsafe<{ year: number; month: number; content: string }[]>(
          `SELECT year, month, content
           FROM retencion_monthly_reports
           WHERE proyecto_id = $1::uuid
             AND COALESCE(audience, 'client') = $2
             AND (year < $3 OR (year = $3 AND month < $4))
           ORDER BY year DESC, month DESC
           LIMIT 1`,
          proyectoId,
          audience,
          year,
          month
        )
        if (anyPrev[0]) previousReport = anyPrev[0]
      }
    }

    const generated = await generateMonthlyReport({
      proyectoId,
      proyecto,
      knowledge: cfg.audit_knowledge,
      schemaSummary: cfg.schema_summary,
      reportPrompt,
      year,
      month,
      hasDb: cfg.db_connected,
      previousReport,
    })

    const titlePrefix = audience === 'buffalo' ? '[Buffalo] ' : ''
    const title = generated.title?.startsWith('[Buffalo]')
      ? generated.title
      : `${titlePrefix}${generated.title}`

    let inserted: { id: string }[]
    try {
      inserted = await prisma.$queryRaw`
        INSERT INTO retencion_monthly_reports (proyecto_id, year, month, audience, title, content, meta)
        VALUES (
          ${proyectoId}::uuid,
          ${year},
          ${month},
          ${audience},
          ${title},
          ${generated.content},
          ${JSON.stringify({ ...generated.meta, audience })}::jsonb
        )
        ON CONFLICT (proyecto_id, year, month, audience) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          meta = EXCLUDED.meta,
          created_at = NOW()
        RETURNING id::text
      `
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      // Fallback si aún no existe la columna audience / unique nuevo
      if (msg.includes('audience') || msg.includes('does not exist') || msg.includes('ON CONFLICT')) {
        inserted = await prisma.$queryRaw`
          INSERT INTO retencion_monthly_reports (proyecto_id, year, month, title, content, meta)
          VALUES (
            ${proyectoId}::uuid,
            ${year},
            ${month},
            ${title},
            ${generated.content},
            ${JSON.stringify({ ...generated.meta, audience })}::jsonb
          )
          ON CONFLICT (proyecto_id, year, month) DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            meta = EXCLUDED.meta,
            created_at = NOW()
          RETURNING id::text
        `
      } else {
        throw e
      }
    }

    return res.status(201).json({
      report: {
        id: inserted[0]?.id,
        year,
        month,
        audience,
        title,
        content: generated.content,
        meta: { ...generated.meta, audience },
      },
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
    const msg = error instanceof Error ? error.message : 'Error interno'
    console.error('[retencion/monthly-report]', error)
    if (msg.includes('retencion_monthly_reports') || msg.includes('does not exist')) {
      return res.status(503).json({
        error: 'Falta migrar tablas. Ejecuta prisma/CREATE_RETENCION_AGENT.sql',
      })
    }
    return res.status(500).json({ error: msg })
  }
}
