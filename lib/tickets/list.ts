import { prisma } from '@/lib/prisma'

export type TicketListRow = {
  id: string
  project_id: string
  project_name: string
  config_ref: string | null
  title: string
  priority: string
  status: string
  last_client_message: string | null
  created_at: Date
}

const LIST_SELECT = `
  SELECT
    t.id, t.project_id, p.name AS project_name, p.config_ref,
    t.title, t.priority, t.status, t.created_at,
    COALESCE(lcu.message, t.description) AS last_client_message
  FROM tickets t
  JOIN proyectos p ON p.id = t.project_id
  LEFT JOIN LATERAL (
    SELECT tu.message
    FROM ticket_updates tu
    WHERE tu.ticket_id = t.id AND tu.is_from_client = true
    ORDER BY tu.created_at DESC
    LIMIT 1
  ) lcu ON true
`

const LIST_SELECT_FALLBACK = `
  SELECT
    t.id, t.project_id, p.name AS project_name, p.config_ref,
    t.title, t.priority, t.status, t.created_at,
    t.description AS last_client_message
  FROM tickets t
  JOIN proyectos p ON p.id = t.project_id
`

export function truncateClientSummary(text: string | null, max = 90): string {
  if (!text?.trim()) return '—'
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

export async function listTickets(params: {
  status?: string | null
  projectId?: string | null
  limit: number
  offset: number
}): Promise<TicketListRow[]> {
  const { status, projectId, limit, offset } = params

  const run = async (select: string) => {
    if (status && projectId) {
      return prisma.$queryRawUnsafe<TicketListRow[]>(
        `${select} WHERE t.status = $1 AND t.project_id = $2::uuid ORDER BY t.created_at DESC LIMIT $3 OFFSET $4`,
        status,
        projectId,
        limit,
        offset
      )
    }
    if (status) {
      return prisma.$queryRawUnsafe<TicketListRow[]>(
        `${select} WHERE t.status = $1 ORDER BY t.created_at DESC LIMIT $2 OFFSET $3`,
        status,
        limit,
        offset
      )
    }
    if (projectId) {
      return prisma.$queryRawUnsafe<TicketListRow[]>(
        `${select} WHERE t.project_id = $1::uuid ORDER BY t.created_at DESC LIMIT $2 OFFSET $3`,
        projectId,
        limit,
        offset
      )
    }
    return prisma.$queryRawUnsafe<TicketListRow[]>(
      `${select} ORDER BY t.created_at DESC LIMIT $1 OFFSET $2`,
      limit,
      offset
    )
  }

  try {
    return await run(LIST_SELECT)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('ticket_updates')) {
      return run(LIST_SELECT_FALLBACK)
    }
    throw err
  }
}

export async function countTickets(params: {
  status?: string | null
  projectId?: string | null
}): Promise<number> {
  const { status, projectId } = params

  if (status && projectId) {
    const c = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM tickets
      WHERE status = ${status} AND project_id = ${projectId}::uuid`
    return Number(c[0]?.count ?? 0)
  }
  if (status) {
    const c = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM tickets WHERE status = ${status}`
    return Number(c[0]?.count ?? 0)
  }
  if (projectId) {
    const c = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM tickets WHERE project_id = ${projectId}::uuid`
    return Number(c[0]?.count ?? 0)
  }
  const c = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM tickets`
  return Number(c[0]?.count ?? 0)
}
