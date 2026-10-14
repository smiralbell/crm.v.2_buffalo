import { query } from '@/lib/db'
import { notify } from '@/lib/notifications'

/** Avisa a los admins y a los developers asignados al proyecto de que ha entrado un ticket. */
export async function alertTeamOfNewTicket(input: {
  ticketId: string
  projectId: string
  projectName: string
  title: string
  priority?: string | null
}): Promise<void> {
  let developerIds: number[] = []
  try {
    const { rows } = await query<{ user_id: number }>(
      `SELECT user_id FROM crm_user_projects WHERE project_id = $1`,
      [input.projectId]
    )
    developerIds = rows.map((r) => r.user_id)
  } catch {
    // sin asignaciones: solo admins
  }
  const urgent = input.priority === 'critical' || input.priority === 'high'
  await notify({
    to: { roles: ['admin'], userIds: developerIds },
    kind: 'ticket.nuevo',
    title: `Nuevo ticket · ${input.projectName}`,
    body: input.title,
    link: `/tickets/${input.ticketId}`,
    severity: urgent ? 'urgent' : 'info',
    dedupeKey: `ticket:${input.ticketId}`,
  })
}
