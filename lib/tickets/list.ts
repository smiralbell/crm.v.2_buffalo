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
  assignee_user_id: number | null
  assignee_name: string | null
  created_at: Date
}

const LIST_SELECT = `
  SELECT
    t.id, t.project_id, p.name AS project_name, p.config_ref,
    t.title, t.priority, t.status, t.created_at,
    t.assignee_user_id, u.name AS assignee_name,
    COALESCE(lcu.message, t.description) AS last_client_message
  FROM tickets t
  JOIN proyectos p ON p.id = t.project_id
  LEFT JOIN crm_users u ON u.id = t.assignee_user_id
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
    t.assignee_user_id, u.name AS assignee_name,
    t.description AS last_client_message
  FROM tickets t
  JOIN proyectos p ON p.id = t.project_id
  LEFT JOIN crm_users u ON u.id = t.assignee_user_id
`

export function truncateClientSummary(text: string | null, max = 90): string {
  if (!text?.trim()) return '—'
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

export async function listTickets(params: {
  status?: string | null
  projectId?: string | null
  projectIds?: string[] | null
  assigneeUserId?: number | null
  limit: number
  offset: number
}): Promise<TicketListRow[]> {
  const { status, projectId, projectIds, assigneeUserId, limit, offset } = params

  const run = async (select: string) => {
    const conditions: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (status) {
      conditions.push(`t.status = $${idx++}`)
      values.push(status)
    }
    if (projectId) {
      conditions.push(`t.project_id = $${idx++}::uuid`)
      values.push(projectId)
    } else if (projectIds && projectIds.length > 0) {
      conditions.push(`t.project_id = ANY($${idx++}::uuid[])`)
      values.push(projectIds)
    }
    if (assigneeUserId != null) {
      conditions.push(`t.assignee_user_id = $${idx++}`)
      values.push(assigneeUserId)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    values.push(limit, offset)
    const limitIdx = idx++
    const offsetIdx = idx

    return prisma.$queryRawUnsafe<TicketListRow[]>(
      `${select} ${where} ORDER BY t.created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      ...values
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
  projectIds?: string[] | null
  assigneeUserId?: number | null
}): Promise<number> {
  const { status, projectId, projectIds, assigneeUserId } = params

  const conditions: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (status) {
    conditions.push(`status = $${idx++}`)
    values.push(status)
  }
  if (projectId) {
    conditions.push(`project_id = $${idx++}::uuid`)
    values.push(projectId)
  } else if (projectIds && projectIds.length > 0) {
    conditions.push(`project_id = ANY($${idx++}::uuid[])`)
    values.push(projectIds)
  }
  if (assigneeUserId != null) {
    conditions.push(`assignee_user_id = $${idx++}`)
    values.push(assigneeUserId)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const c = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM tickets ${where}`,
    ...values
  )
  return Number(c[0]?.count ?? 0)
}

export type TicketStats = {
  total: number
  unresolved: number
  open: number
  in_progress: number
  resolved: number
  closed: number
  projects_with_tickets: number
  last_7_days: number
}

const EMPTY_STATS: TicketStats = {
  total: 0,
  unresolved: 0,
  open: 0,
  in_progress: 0,
  resolved: 0,
  closed: 0,
  projects_with_tickets: 0,
  last_7_days: 0,
}

export async function getTicketStats(): Promise<TicketStats> {
  const rows = await prisma.$queryRaw<
    {
      total: bigint
      unresolved: bigint
      open_count: bigint
      in_progress_count: bigint
      resolved_count: bigint
      closed_count: bigint
      projects_with_tickets: bigint
      last_7_days: bigint
    }[]
  >`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE status IN ('open', 'in_progress'))::bigint AS unresolved,
      COUNT(*) FILTER (WHERE status = 'open')::bigint AS open_count,
      COUNT(*) FILTER (WHERE status = 'in_progress')::bigint AS in_progress_count,
      COUNT(*) FILTER (WHERE status = 'resolved')::bigint AS resolved_count,
      COUNT(*) FILTER (WHERE status = 'closed')::bigint AS closed_count,
      COUNT(DISTINCT project_id)::bigint AS projects_with_tickets,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::bigint AS last_7_days
    FROM tickets
  `

  const r = rows[0]
  if (!r) return EMPTY_STATS

  return {
    total: Number(r.total),
    unresolved: Number(r.unresolved),
    open: Number(r.open_count),
    in_progress: Number(r.in_progress_count),
    resolved: Number(r.resolved_count),
    closed: Number(r.closed_count),
    projects_with_tickets: Number(r.projects_with_tickets),
    last_7_days: Number(r.last_7_days),
  }
}
