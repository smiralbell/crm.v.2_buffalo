import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAccessibleProjectIds, getDevelopersByProjectIds } from '@/lib/project-access'
import { listAssignmentsForUser } from '@/lib/developer/assignments'

type ProyectoRow = {
  id: string
  name: string
  status: string
  service_type: string
  config_ref: string | null
  lead_id: number | null
  contact_id: number | null
  updated_at: Date
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await requireAuthAPI(req, res)
    const accessibleIds = await getAccessibleProjectIds(user)

    let proyectos: ProyectoRow[]
    if (accessibleIds === null) {
      proyectos = await prisma.$queryRaw<ProyectoRow[]>`
        SELECT id, name, status, service_type, config_ref, lead_id, contact_id, updated_at
        FROM proyectos
        WHERE status IN ('development', 'active', 'paused')
        ORDER BY updated_at DESC
      `
    } else if (accessibleIds.length === 0) {
      proyectos = []
    } else {
      proyectos = await prisma.$queryRaw<ProyectoRow[]>`
        SELECT id, name, status, service_type, config_ref, lead_id, contact_id, updated_at
        FROM proyectos
        WHERE status IN ('development', 'active', 'paused')
          AND id = ANY(${accessibleIds}::uuid[])
        ORDER BY updated_at DESC
      `
    }

    const leadIds = proyectos.map((p) => p.lead_id).filter((id): id is number => id != null)

    const leads = leadIds.length
      ? await prisma.lead.findMany({
          where: { id: { in: leadIds } },
          include: {
            contact: {
              select: { id: true, nombre: true, email: true, empresa: true },
            },
          },
        })
      : []

    const contactIds = proyectos
      .filter((p) => !p.lead_id && p.contact_id)
      .map((p) => p.contact_id as number)

    const contacts =
      contactIds.length > 0
        ? await prisma.contact.findMany({
            where: { id: { in: contactIds } },
            select: { id: true, nombre: true, email: true, empresa: true },
          })
        : []

    const leadMap = new Map(leads.map((l) => [l.id, l]))
    const contactMap = new Map(contacts.map((c) => [c.id, c]))

    const projectIds = proyectos.map((p) => p.id)
    let taskCounts: Record<
      string,
      { pending: number; in_progress: number; buffalo_validation: number; done: number }
    > = {}
    const devMap = await getDevelopersByProjectIds(projectIds)

    if (projectIds.length > 0) {
      try {
        const counts = await prisma.$queryRaw<
          { project_id: string; status: string; count: string | number }[]
        >`
          SELECT project_id, status, COUNT(*)::int AS count
          FROM project_dev_tasks
          WHERE project_id = ANY(${projectIds}::uuid[])
          GROUP BY project_id, status
        `
        for (const row of counts) {
          if (!taskCounts[row.project_id]) {
            taskCounts[row.project_id] = {
              pending: 0,
              in_progress: 0,
              buffalo_validation: 0,
              done: 0,
            }
          }
          const status = row.status as
            | 'pending'
            | 'in_progress'
            | 'buffalo_validation'
            | 'done'
          if (status in taskCounts[row.project_id]) {
            taskCounts[row.project_id][status] = Number(row.count)
          }
        }
      } catch {
        taskCounts = {}
      }
    }

    const projectRows = proyectos.map((p) => {
      const lead = p.lead_id ? leadMap.get(p.lead_id) : null
      const contact =
        lead?.contact ?? (p.contact_id ? contactMap.get(p.contact_id) ?? null : null)

      return {
        kind: 'project' as const,
        id: p.id,
        name: p.name,
        status: p.status,
        service_type: p.service_type,
        config_ref: p.config_ref,
        lead_id: p.lead_id,
        updated_at:
          p.updated_at instanceof Date ? p.updated_at.toISOString() : String(p.updated_at),
        contact,
        task_counts: taskCounts[p.id] || {
          pending: 0,
          in_progress: 0,
          buffalo_validation: 0,
          done: 0,
        },
        developers: devMap[p.id] || [],
      }
    })

    const assignmentRows =
      user.role === 'developer'
        ? (await listAssignmentsForUser(user.id)).map((a) => ({
            kind: 'assignment' as const,
            id: a.id,
            name: a.title,
            status: a.status,
            service_type: 'assignment',
            config_ref: null as string | null,
            lead_id: null as number | null,
            updated_at: a.updated_at,
            contact: null,
            task_counts: {
              pending: a.status === 'pending' ? 1 : 0,
              in_progress: a.status === 'in_progress' ? 1 : 0,
              buffalo_validation: 0,
              done: a.status === 'done' ? 1 : 0,
            },
            developers: [] as { id: number; name: string; email: string }[],
            assignment_summary: a.summary,
            due_date: a.due_date,
          }))
        : []

    const merged = [...assignmentRows, ...projectRows].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )

    return res.status(200).json({ proyectos: merged, total: merged.length })
  } catch (error) {
    if (error instanceof Error && ['No session', 'Invalid session'].includes(error.message)) {
      return
    }
    const msg = error instanceof Error ? error.message : 'Error interno'
    console.error('[gestion-proyecto/proyectos]', error)
    return res.status(500).json({ error: msg })
  }
}
