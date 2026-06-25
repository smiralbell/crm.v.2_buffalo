import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { countTickets, getTicketStats, listTickets, truncateClientSummary } from '@/lib/tickets/list'

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

    const rows = await listTickets({ status, projectId, limit, offset })
    const total = await countTickets({ status, projectId })
    const stats = await getTicketStats().catch(() => null)

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
        id: r.id,
        project_id: r.project_id,
        project_name: r.project_name,
        config_ref: r.config_ref,
        title: r.title,
        priority: r.priority,
        status: r.status,
        last_client_summary: truncateClientSummary(r.last_client_message),
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      })),
      total,
      stats,
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
      return res.status(200).json({ tickets: [], total: 0, stats: null, projects: [] })
    }
    if (process.env.NODE_ENV === 'development') console.error('[tickets/index]', err)
    return res.status(500).json({ error: msg })
  }
}
