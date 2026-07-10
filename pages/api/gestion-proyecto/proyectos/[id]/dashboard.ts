import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { prisma } from '@/lib/prisma'
import { buildProjectDashboard } from '@/lib/gestion-proyecto/dashboard-metrics'

type DbProyecto = {
  id: string
  name: string
  service_type: string
  status: string
  config_ref: string | null
  created_at: Date
  launched_at: Date | null
  dev_target_end_date: Date | null
}

type DbTask = {
  id: string
  status: string
  priority: string
  assignee: string | null
  estimated_hours: number | null
  created_at: Date
  updated_at: Date
}

const patchSchema = z.object({
  dev_target_end_date: z.string().nullable().optional(),
})

async function fetchProyecto(id: string): Promise<DbProyecto | null> {
  try {
    const rows = await prisma.$queryRaw<DbProyecto[]>`
      SELECT
        id, name, service_type, status, config_ref,
        created_at, launched_at, dev_target_end_date
      FROM proyectos
      WHERE id = ${id}::uuid
      LIMIT 1
    `
    return rows[0] ?? null
  } catch {
    const rows = await prisma.$queryRaw<
      {
        id: string
        name: string
        service_type: string
        status: string
        config_ref: string | null
        created_at: Date
        launched_at: Date | null
      }[]
    >`
      SELECT id, name, service_type, status, config_ref, created_at, launched_at
      FROM proyectos
      WHERE id = ${id}::uuid
      LIMIT 1
    `
    const row = rows[0]
    if (!row) return null
    return { ...row, dev_target_end_date: null }
  }
}

async function fetchTasks(projectId: string): Promise<DbTask[]> {
  try {
    return await prisma.$queryRaw<DbTask[]>`
      SELECT
        id, status, priority, assignee,
        estimated_hours::float AS estimated_hours,
        created_at, updated_at
      FROM project_dev_tasks
      WHERE project_id = ${projectId}::uuid
      ORDER BY created_at ASC
    `
  } catch {
    const rows = await prisma.$queryRaw<
      Omit<DbTask, 'estimated_hours'>[]
    >`
      SELECT id, status, priority, assignee, created_at, updated_at
      FROM project_dev_tasks
      WHERE project_id = ${projectId}::uuid
      ORDER BY created_at ASC
    `
    return rows.map((r) => ({ ...r, estimated_hours: null }))
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  if (!projectId) return res.status(400).json({ error: 'ID de proyecto requerido' })

  try {
    await requireProjectAccessAPI(req, res, projectId)

    const proyecto = await fetchProyecto(projectId)
    if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' })

    if (req.method === 'GET') {
      const taskRows = await fetchTasks(projectId)
      const dashboard = buildProjectDashboard(
        {
          id: proyecto.id,
          name: proyecto.name,
          status: proyecto.status,
          service_type: proyecto.service_type,
          config_ref: proyecto.config_ref,
          created_at: proyecto.created_at.toISOString(),
          launched_at: proyecto.launched_at?.toISOString() ?? null,
          dev_target_end_date: proyecto.dev_target_end_date
            ? proyecto.dev_target_end_date.toISOString().slice(0, 10)
            : null,
        },
        taskRows.map((t) => ({
          id: t.id,
          status: t.status as 'pending' | 'in_progress' | 'buffalo_validation' | 'done',
          priority: t.priority as 'low' | 'medium' | 'high',
          assignee: t.assignee,
          estimated_hours: t.estimated_hours,
          created_at: t.created_at.toISOString(),
          updated_at: t.updated_at.toISOString(),
        }))
      )
      return res.status(200).json(dashboard)
    }

    if (req.method === 'PATCH') {
      const data = patchSchema.parse(req.body)
      if (data.dev_target_end_date !== undefined) {
        try {
          await prisma.$executeRaw`
            UPDATE proyectos
            SET dev_target_end_date = ${data.dev_target_end_date ? new Date(data.dev_target_end_date) : null},
                updated_at = NOW()
            WHERE id = ${projectId}::uuid
          `
        } catch (e) {
          const msg = e instanceof Error ? e.message : ''
          if (msg.includes('dev_target_end_date')) {
            return res.status(500).json({
              error: 'Falta columna dev_target_end_date.',
              hint: 'Ejecuta prisma/ALTER_PROJECT_GESTION_DASHBOARD.sql en PostgreSQL.',
            })
          }
          throw e
        }
      }
      const updated = await fetchProyecto(projectId)
      return res.status(200).json({
        dev_target_end_date: updated?.dev_target_end_date
          ? updated.dev_target_end_date.toISOString().slice(0, 10)
          : null,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('project_dev_tasks') || msg.includes('does not exist')) {
      return res.status(500).json({
        error: 'Faltan tablas de gestión de proyecto.',
        hint: 'Ejecuta prisma/CREATE_PROJECT_GESTION_TABLES.sql en PostgreSQL.',
      })
    }
    console.error('[gestion-proyecto/dashboard]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
