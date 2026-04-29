import { prisma } from '@/lib/prisma'

export function daysBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

export async function listEvaluationProjectsForUI() {
  const projects = await prisma.evaluationProject.findMany({
    where: { deleted_at: null },
    orderBy: { updated_at: 'desc' },
    include: {
      entries: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { body: true, created_at: true, rating: true },
      },
    },
  })

  const projectIds = projects.map((p) => p.id)
  const avgs =
    projectIds.length === 0
      ? []
      : await prisma.projectJournalEntry.groupBy({
          by: ['project_id'],
          where: { project_id: { in: projectIds }, rating: { not: null } },
          _avg: { rating: true },
        })
  const avgByProject = new Map(avgs.map((a) => [a.project_id, a._avg.rating]))

  const now = new Date()
  return projects.map((p) => {
    const end = p.closed_at ?? now
    const avg = avgByProject.get(p.id)
    const last = p.entries[0]
    return {
      id: p.id,
      name: p.name,
      client_name: p.client_name,
      is_active: p.is_active,
      tags: p.tags,
      opened_at: p.opened_at.toISOString(),
      closed_at: p.closed_at?.toISOString() ?? null,
      updated_at: p.updated_at.toISOString(),
      days_open: daysBetween(p.opened_at, end),
      avg_rating: avg != null ? Math.round(avg * 10) / 10 : null,
      last_entry_at: last?.created_at.toISOString() ?? null,
      last_entry_preview: last ? last.body.slice(0, 160) + (last.body.length > 160 ? '…' : '') : null,
    }
  })
}

export async function getEvaluationProjectDetail(id: number) {
  const project = await prisma.evaluationProject.findFirst({
    where: { id, deleted_at: null },
    include: {
      entries: { orderBy: { created_at: 'desc' } },
      analyses: { orderBy: { created_at: 'desc' }, take: 1 },
    },
  })
  if (!project) return null

  const ratings = project.entries.filter((e) => e.rating != null).map((e) => e.rating as number)
  const avg_rating =
    ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null

  const now = new Date()
  const end = project.closed_at ?? now
  const days_open = daysBetween(project.opened_at, end)

  const latestEntry = project.entries[0] ?? null
  const latestAnalysis = project.analyses[0] ?? null

  return {
    project: {
      id: project.id,
      name: project.name,
      client_name: project.client_name,
      is_active: project.is_active,
      tags: project.tags,
      opened_at: project.opened_at.toISOString(),
      closed_at: project.closed_at?.toISOString() ?? null,
      updated_at: project.updated_at.toISOString(),
      days_open,
      avg_rating,
    },
    entries: project.entries.map((e) => ({
      id: e.id,
      body: e.body,
      rating: e.rating,
      created_at: e.created_at.toISOString(),
    })),
    latest_analysis: latestAnalysis
      ? {
          id: latestAnalysis.id,
          summary_json: latestAnalysis.summary_json as Record<string, unknown>,
          model: latestAnalysis.model,
          created_at: latestAnalysis.created_at.toISOString(),
        }
      : null,
    last_entry_for_context: latestEntry
      ? { body: latestEntry.body, created_at: latestEntry.created_at.toISOString() }
      : null,
  }
}
