import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type TicketRow = {
  id: string
  project_id: string
  project_name: string
  config_ref: string | null
  title: string
  description: string | null
  priority: string
  status: string
  reporter_name: string | null
  reporter_email: string | null
  source: string
  external_id: string | null
  custom_fields: unknown
  created_at: Date
  updated_at: Date
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const status = (req.query.status as string) || null
    const projectId = (req.query.project_id as string) || null
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100)
    const offset = parseInt(req.query.offset as string, 10) || 0

    let rows: TicketRow[]

    if (status && projectId) {
      rows = await prisma.$queryRaw<TicketRow[]>`
        SELECT t.id, t.project_id, p.name AS project_name, p.config_ref,
          t.title, t.description, t.priority, t.status,
          t.reporter_name, t.reporter_email, t.source, t.external_id,
          t.custom_fields, t.created_at, t.updated_at
        FROM tickets t JOIN proyectos p ON p.id = t.project_id
        WHERE t.status = ${status} AND t.project_id = ${projectId}::uuid
        ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}`
    } else if (status) {
      rows = await prisma.$queryRaw<TicketRow[]>`
        SELECT t.id, t.project_id, p.name AS project_name, p.config_ref,
          t.title, t.description, t.priority, t.status,
          t.reporter_name, t.reporter_email, t.source, t.external_id,
          t.custom_fields, t.created_at, t.updated_at
        FROM tickets t JOIN proyectos p ON p.id = t.project_id
        WHERE t.status = ${status}
        ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}`
    } else if (projectId) {
      rows = await prisma.$queryRaw<TicketRow[]>`
        SELECT t.id, t.project_id, p.name AS project_name, p.config_ref,
          t.title, t.description, t.priority, t.status,
          t.reporter_name, t.reporter_email, t.source, t.external_id,
          t.custom_fields, t.created_at, t.updated_at
        FROM tickets t JOIN proyectos p ON p.id = t.project_id
        WHERE t.project_id = ${projectId}::uuid
        ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}`
    } else {
      rows = await prisma.$queryRaw<TicketRow[]>`
        SELECT t.id, t.project_id, p.name AS project_name, p.config_ref,
          t.title, t.description, t.priority, t.status,
          t.reporter_name, t.reporter_email, t.source, t.external_id,
          t.custom_fields, t.created_at, t.updated_at
        FROM tickets t JOIN proyectos p ON p.id = t.project_id
        ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}`
    }

    let total = rows.length
    if (status && projectId) {
      const c = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM tickets
        WHERE status = ${status} AND project_id = ${projectId}::uuid`
      total = Number(c[0]?.count ?? 0)
    } else if (status) {
      const c = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM tickets WHERE status = ${status}`
      total = Number(c[0]?.count ?? 0)
    } else if (projectId) {
      const c = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM tickets WHERE project_id = ${projectId}::uuid`
      total = Number(c[0]?.count ?? 0)
    } else {
      const c = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM tickets`
      total = Number(c[0]?.count ?? 0)
    }

    const projects = await prisma.$queryRaw<
      { id: string; name: string; config_ref: string | null; ticket_count: bigint }[]
    >`
      SELECT p.id, p.name, p.config_ref, COUNT(t.id)::bigint AS ticket_count
      FROM proyectos p
      LEFT JOIN tickets t ON t.project_id = p.id
      GROUP BY p.id, p.name, p.config_ref
      HAVING COUNT(t.id) > 0
      ORDER BY COUNT(t.id) DESC
    `

    return res.status(200).json({
      tickets: rows.map((r) => ({
        ...r,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
      })),
      total,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        config_ref: p.config_ref,
        ticket_count: Number(p.ticket_count),
      })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (msg.includes('relation "tickets" does not exist')) {
      return res.status(200).json({ tickets: [], total: 0, projects: [] })
    }
    if (process.env.NODE_ENV === 'development') console.error('[tickets/index]', err)
    return res.status(500).json({ error: msg })
  }
}
